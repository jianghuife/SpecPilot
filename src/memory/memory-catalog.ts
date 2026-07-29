import { execFile } from 'node:child_process';
import { cp, lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from '../project/project-store.js';
import { toPosixPath, writeJsonAtomic } from '../utils/files.js';

interface MemoryIndexEntry {
  relativePath: string;
  title: string;
  domain?: string;
  summary?: string;
  searchable: string;
}

interface MemoryIndex {
  schema_version: 1;
  generated_at: string;
  entries: MemoryIndexEntry[];
}

export interface MemoryResult {
  relativePath: string;
  title: string;
  domain?: string;
  summary?: string;
  content: string;
  score: number;
}

export interface LocalSession {
  schema_version?: 1;
  active_change?: string;
  active_task?: string;
  notes?: string[];
  updated_at?: string;
}

export interface KnowledgeInventory {
  schema_version: 1;
  generated_at: string;
  project_name: string;
  manifests: string[];
  source_roots: string[];
  test_roots: string[];
  languages: Record<string, number>;
  existing_memory: string[];
  review_status: 'pending';
}

export interface KnowledgeInitializationResult {
  reportPath: string;
  written: boolean;
  inventory: KnowledgeInventory;
}

const INVENTORY_SKIP_DIRECTORIES = new Set([
  '.agents',
  '.claude',
  '.codex',
  '.git',
  '.specpilot',
  'coverage',
  'dist',
  'node_modules',
  'specs',
]);
const MANIFEST_NAMES = [
  'Cargo.toml',
  'Gemfile',
  'go.mod',
  'package.json',
  'pom.xml',
  'pyproject.toml',
  'requirements.txt',
] as const;
const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.c': 'C',
  '.cc': 'C++',
  '.cpp': 'C++',
  '.cs': 'C#',
  '.go': 'Go',
  '.java': 'Java',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.kt': 'Kotlin',
  '.kts': 'Kotlin',
  '.php': 'PHP',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.rs': 'Rust',
  '.scala': 'Scala',
  '.swift': 'Swift',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.vue': 'Vue',
};

async function markdownFiles(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry): Promise<string[]> => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return markdownFiles(entryPath);
        return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
      }),
    );
    return nested.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await lstat(directory)).isDirectory();
  } catch {
    return false;
  }
}

function rgFiles(root: string, directories: string[]): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      'rg',
      ['--files', '--null', '--glob', '*.md', ...directories],
      { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(
          stdout
            .split('\0')
            .filter(Boolean)
            .map((filePath) => path.join(root, filePath)),
        );
      },
    );
  });
}

async function listMemoryFiles(root: string): Promise<string[]> {
  const relativeRoots = ['specs/project', 'specs/knowledge'];
  const existingRoots = (
    await Promise.all(
      relativeRoots.map(async (relativePath) => ({
        relativePath,
        exists: await directoryExists(path.join(root, relativePath)),
      })),
    )
  )
    .filter((item) => item.exists)
    .map((item) => item.relativePath);
  if (existingRoots.length === 0) return [];
  try {
    return (await rgFiles(root, existingRoots)).sort();
  } catch {
    return (
      await Promise.all(existingRoots.map((directory) => markdownFiles(path.join(root, directory))))
    )
      .flat()
      .sort();
  }
}

async function walkProjectFiles(directory: string, root: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.isDirectory() && INVENTORY_SKIP_DIRECTORIES.has(entry.name)) return [];
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkProjectFiles(entryPath, root);
      return entry.isFile() ? [toPosixPath(path.relative(root, entryPath))] : [];
    }),
  );
  return nested.flat();
}

function rgProjectFiles(root: string): Promise<string[]> {
  const excluded = [...INVENTORY_SKIP_DIRECTORIES].flatMap((directory) => [
    '--glob',
    `!${directory}/**`,
  ]);
  return new Promise((resolve, reject) => {
    execFile(
      'rg',
      ['--files', '--null', '--hidden', ...excluded],
      { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout.split('\0').filter(Boolean).map(toPosixPath));
      },
    );
  });
}

async function inventoryFiles(root: string): Promise<string[]> {
  try {
    return (await rgProjectFiles(root)).sort();
  } catch {
    return (await walkProjectFiles(root, root)).sort();
  }
}

function titleOf(content: string, fallback: string): string {
  return /^#\s+(.+)$/m.exec(content)?.[1]?.trim() ?? fallback;
}

function words(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .split(/[^a-z0-9_-]+/u)
    .filter((word) => word.length > 1);
}

function stringList(value: unknown, field: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.trim() === '')
  ) {
    throw new Error(`${field} must be a non-empty string array`);
  }
  return value;
}

function validateKnowledge(content: string, filePath: string): void {
  const { metadata } = parseFrontmatter(content, filePath);
  const requiredStrings = ['domain', 'summary', 'invalidation_condition', 'verified_at'] as const;
  for (const field of requiredStrings) {
    if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
      throw new Error(`${field} must be a non-empty string`);
    }
  }
  stringList(metadata.source_refs, 'source_refs');
  stringList(metadata.evidence_refs, 'evidence_refs');
  if (Number.isNaN(Date.parse(metadata.verified_at as string))) {
    throw new Error('verified_at must be an ISO timestamp');
  }
}

export class MemoryCatalog {
  readonly root: string;
  readonly cachePath: string;
  readonly sessionPath: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.cachePath = path.join(this.root, '.specpilot', 'cache', 'memory-index.json');
    this.sessionPath = path.join(this.root, '.specpilot', 'local', 'session.json');
  }

  async refresh(): Promise<MemoryIndex> {
    const files = await listMemoryFiles(this.root);
    const entries = await Promise.all(
      files.map(async (filePath): Promise<MemoryIndexEntry> => {
        const content = await readFile(filePath, 'utf8');
        let domain: string | undefined;
        let summary: string | undefined;
        if (content.startsWith('---\n')) {
          try {
            const { metadata } = parseFrontmatter(content, filePath);
            domain = typeof metadata.domain === 'string' ? metadata.domain : undefined;
            summary = typeof metadata.summary === 'string' ? metadata.summary : undefined;
          } catch {
            // Project documents without valid knowledge frontmatter remain searchable.
          }
        }
        return {
          relativePath: toPosixPath(path.relative(this.root, filePath)),
          title: titleOf(content, path.basename(filePath, '.md')),
          domain,
          summary,
          searchable: `${domain ?? ''} ${summary ?? ''} ${content}`.toLocaleLowerCase(),
        };
      }),
    );
    const index: MemoryIndex = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      entries,
    };
    await writeJsonAtomic(this.cachePath, index);
    return index;
  }

  private async index(): Promise<MemoryIndex> {
    try {
      const value = JSON.parse(await readFile(this.cachePath, 'utf8')) as MemoryIndex;
      if (value.schema_version === 1 && Array.isArray(value.entries)) return value;
    } catch {
      // The index is disposable and can always be rebuilt from Markdown.
    }
    return this.refresh();
  }

  async search(query: string, limit = 8): Promise<MemoryResult[]> {
    const tokens = words(query);
    const index = await this.index();
    const ranked = index.entries
      .map((entry) => ({
        entry,
        score: tokens.reduce(
          (score, token) => score + (entry.searchable.includes(token) ? 1 : 0),
          0,
        ),
      }))
      .filter(({ score }) => tokens.length === 0 || score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.entry.relativePath.localeCompare(right.entry.relativePath),
      )
      .slice(0, limit);
    return Promise.all(
      ranked.map(async ({ entry, score }) => ({
        relativePath: entry.relativePath,
        title: entry.title,
        domain: entry.domain,
        summary: entry.summary,
        content: await readFile(path.join(this.root, entry.relativePath), 'utf8'),
        score,
      })),
    );
  }

  async initializeKnowledge(
    options: { dryRun?: boolean } = {},
  ): Promise<KnowledgeInitializationResult> {
    const files = await inventoryFiles(this.root);
    const manifests = MANIFEST_NAMES.filter((manifest) => files.includes(manifest));
    let projectName = path.basename(this.root);
    if (manifests.includes('package.json')) {
      try {
        const packageMetadata = JSON.parse(
          await readFile(path.join(this.root, 'package.json'), 'utf8'),
        ) as { name?: unknown };
        if (typeof packageMetadata.name === 'string' && packageMetadata.name.trim() !== '') {
          projectName = packageMetadata.name;
        }
      } catch {
        // A malformed manifest remains visible in the inventory for agent review.
      }
    }

    const languages: Record<string, number> = {};
    for (const filePath of files) {
      const language = LANGUAGE_BY_EXTENSION[path.extname(filePath).toLocaleLowerCase()];
      if (language) languages[language] = (languages[language] ?? 0) + 1;
    }
    const topLevelDirectories = new Set(
      files.filter((filePath) => filePath.includes('/')).map((filePath) => filePath.split('/')[0]),
    );
    const sourceRoots = ['src', 'lib', 'app', 'packages', 'services'].filter((directory) =>
      topLevelDirectories.has(directory),
    );
    const testRoots = ['test', 'tests', '__tests__', 'spec'].filter((directory) =>
      topLevelDirectories.has(directory),
    );
    const existingMemory = (await listMemoryFiles(this.root)).map((filePath) =>
      toPosixPath(path.relative(this.root, filePath)),
    );
    const inventory: KnowledgeInventory = {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      project_name: projectName,
      manifests: [...manifests],
      source_roots: sourceRoots,
      test_roots: testRoots,
      languages,
      existing_memory: existingMemory,
      review_status: 'pending',
    };
    const reportPath = path.join(this.root, '.specpilot', 'local', 'knowledge-init.json');
    if (!options.dryRun) {
      await writeJsonAtomic(reportPath, inventory);
      await this.refresh();
    }
    return { reportPath, written: !options.dryRun, inventory };
  }

  async promote(candidatePath: string): Promise<string> {
    const resolved = path.resolve(candidatePath);
    const allowedRoot = path.join(this.root, '.specpilot', 'local', 'knowledge-candidates');
    if (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) {
      throw new Error('knowledge candidates must come from .specpilot/local/knowledge-candidates');
    }
    const content = await readFile(resolved, 'utf8');
    validateKnowledge(content, resolved);
    const destination = path.join(this.root, 'specs', 'knowledge', path.basename(resolved));
    await cp(resolved, destination, { force: false });
    await this.refresh();
    return destination;
  }

  async writeSession(session: LocalSession): Promise<void> {
    await writeJsonAtomic(this.sessionPath, {
      schema_version: 1,
      active_change: session.active_change,
      active_task: session.active_task,
      notes: session.notes ?? [],
      updated_at: new Date().toISOString(),
    });
  }

  async readSession(): Promise<LocalSession | undefined> {
    try {
      return JSON.parse(await readFile(this.sessionPath, 'utf8')) as LocalSession;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
}

export { validateKnowledge };
