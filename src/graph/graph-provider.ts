import { spawn } from 'node:child_process';
import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { toPosixPath } from '../utils/files.js';

export interface GraphReadiness {
  provider: 'codegraph' | 'source-fallback' | 'unavailable';
  available: boolean;
  indexed: boolean;
  stale: boolean;
  version?: string;
  details?: unknown;
  error?: string;
}

export interface GraphResult {
  provider: 'codegraph' | 'source-fallback' | 'unavailable';
  operation: 'explore' | 'impact' | 'affected';
  advisory: true;
  needsSourceConfirmation: true;
  output: string;
  data?: unknown;
  warnings: string[];
}

export interface GraphProvider {
  readiness(): Promise<GraphReadiness>;
  explore(query: string): Promise<GraphResult>;
  impact(symbol: string): Promise<GraphResult>;
  affected(files: string[]): Promise<GraphResult>;
}

const GRAPH_PATH_KEYS = new Set(['file', 'filePath', 'path', 'relativePath', 'uri']);

function safeGraphPath(value: string): string | undefined {
  const withoutScheme = value.startsWith('file://') ? value.slice('file://'.length) : value;
  const normalized = path.posix.normalize(withoutScheme.replaceAll('\\', '/'));
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized)
  ) {
    return undefined;
  }
  return normalized;
}

function collectGraphDataPaths(value: unknown, key: string | undefined, paths: Set<string>): void {
  if (typeof value === 'string') {
    if (!key || !GRAPH_PATH_KEYS.has(key)) return;
    const candidate = safeGraphPath(value);
    if (candidate) paths.add(candidate);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectGraphDataPaths(item, key, paths);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [childKey, child] of Object.entries(value)) {
    collectGraphDataPaths(child, childKey, paths);
  }
}

// Graph output is advisory and provider-specific; this parser is the only
// place that interprets those formats. Consumers receive normalized, safe,
// repository-relative candidate paths and still confirm them in source.
export function graphCandidateFiles(result: GraphResult): string[] {
  const candidates = new Set<string>();
  collectGraphDataPaths(result.data, undefined, candidates);
  for (const line of result.output.split(/\r?\n/u)) {
    const match = /^(.+?):\d+(?::|\s)/u.exec(line.trim());
    if (!match?.[1]) continue;
    const candidate = safeGraphPath(match[1]);
    if (candidate) candidates.add(candidate);
  }
  return [...candidates].sort();
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

function execute(
  executable: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
  });
}

function parseJson(output: string): unknown {
  try {
    return JSON.parse(output);
  } catch {
    return undefined;
  }
}

export class CodeGraphAdapter implements GraphProvider {
  readonly root: string;
  readonly executable: string;

  constructor(root: string, executable = 'codegraph') {
    this.root = path.resolve(root);
    this.executable = executable;
  }

  async readiness(): Promise<GraphReadiness> {
    let versionResult: Awaited<ReturnType<typeof execute>>;
    try {
      versionResult = await execute(this.executable, ['version'], this.root);
    } catch (error) {
      return {
        provider: 'codegraph',
        available: false,
        indexed: false,
        stale: false,
        error: (error as Error).message,
      };
    }
    if (versionResult.exitCode !== 0) {
      return {
        provider: 'codegraph',
        available: false,
        indexed: false,
        stale: false,
        error: versionResult.stderr.trim() || 'CodeGraph version check failed',
      };
    }
    const indexed = await exists(path.join(this.root, '.codegraph'));
    if (!indexed) {
      return {
        provider: 'codegraph',
        available: true,
        indexed: false,
        stale: false,
        version: versionResult.stdout.trim(),
      };
    }
    const status = await execute(this.executable, ['status', this.root, '--json'], this.root);
    const details = parseJson(status.stdout);
    const stale =
      details && typeof details === 'object' && 'stale' in details
        ? (details as { stale?: unknown }).stale === true
        : /stale|out.of.date/i.test(`${status.stdout}\n${status.stderr}`);
    return {
      provider: 'codegraph',
      available: true,
      indexed: status.exitCode === 0,
      stale,
      version: versionResult.stdout.trim(),
      details,
      error: status.exitCode === 0 ? undefined : status.stderr.trim() || 'status failed',
    };
  }

  private async query(operation: GraphResult['operation'], args: string[]): Promise<GraphResult> {
    const result = await execute(this.executable, args, this.root);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || `CodeGraph ${operation} failed`);
    }
    return {
      provider: 'codegraph',
      operation,
      advisory: true,
      needsSourceConfirmation: true,
      output: result.stdout,
      data: parseJson(result.stdout),
      warnings: [
        'Graph output narrows the reading scope; confirm conclusions in source, tests, or logs.',
      ],
    };
  }

  explore(query: string): Promise<GraphResult> {
    return this.query('explore', ['explore', query]);
  }

  impact(symbol: string): Promise<GraphResult> {
    return this.query('impact', ['impact', symbol, '--json']);
  }

  affected(files: string[]): Promise<GraphResult> {
    if (files.length === 0) throw new Error('affected requires at least one file');
    return this.query('affected', ['affected', ...files, '--json']);
  }

  async initialize(): Promise<void> {
    const result = await execute(this.executable, ['init', this.root], this.root);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr.trim() || 'CodeGraph initialization failed');
    }
  }
}

const SOURCE_EXTENSIONS = new Set([
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.go',
  '.h',
  '.hpp',
  '.java',
  '.js',
  '.jsx',
  '.kt',
  '.kts',
  '.m',
  '.mm',
  '.php',
  '.py',
  '.rb',
  '.rs',
  '.scala',
  '.swift',
  '.ts',
  '.tsx',
  '.vue',
]);
const SKIP_DIRECTORIES = new Set([
  '.git',
  '.codegraph',
  '.specpilot',
  'coverage',
  'dist',
  'node_modules',
]);

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.name.startsWith('.') && entry.name !== '.github') return [];
      if (SKIP_DIRECTORIES.has(entry.name)) return [];
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(entryPath);
      return entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

export class SourceFallbackAdapter implements GraphProvider {
  readonly root: string;
  readonly reason: string;

  constructor(root: string, reason = 'CodeGraph is unavailable') {
    this.root = path.resolve(root);
    this.reason = reason;
  }

  async readiness(): Promise<GraphReadiness> {
    return {
      provider: 'source-fallback',
      available: true,
      indexed: false,
      stale: false,
    };
  }

  private result(operation: GraphResult['operation'], output: string): GraphResult {
    return {
      provider: 'source-fallback',
      operation,
      advisory: true,
      needsSourceConfirmation: true,
      output,
      warnings: [
        `${this.reason}; results come from literal source search and may miss dynamic relationships.`,
      ],
    };
  }

  async explore(query: string): Promise<GraphResult> {
    const queryLower = query.toLocaleLowerCase();
    const matches: string[] = [];
    for (const filePath of await sourceFiles(this.root)) {
      const lines = (await readFile(filePath, 'utf8')).split(/\r?\n/u);
      lines.forEach((line, index) => {
        if (line.toLocaleLowerCase().includes(queryLower)) {
          matches.push(
            `${toPosixPath(path.relative(this.root, filePath))}:${index + 1}:${line.trim()}`,
          );
        }
      });
      if (matches.length >= 100) break;
    }
    return this.result('explore', matches.slice(0, 100).join('\n'));
  }

  impact(symbol: string): Promise<GraphResult> {
    return this.explore(symbol).then((result) => ({ ...result, operation: 'impact' }));
  }

  async affected(files: string[]): Promise<GraphResult> {
    const testFiles = (await sourceFiles(this.root))
      .map((filePath) => toPosixPath(path.relative(this.root, filePath)))
      .filter((filePath) => /(^|\/)(test|tests|__tests__)(\/|$)|\.(test|spec)\./u.test(filePath));
    return this.result(
      'affected',
      `Changed files:\n${files.join('\n')}\n\nCandidate tests:\n${testFiles.join('\n')}`,
    );
  }
}

class ResilientCodeGraphAdapter implements GraphProvider {
  readonly primary: CodeGraphAdapter;
  readonly fallback: SourceFallbackAdapter;

  constructor(primary: CodeGraphAdapter) {
    this.primary = primary;
    this.fallback = new SourceFallbackAdapter(
      primary.root,
      'The CodeGraph query failed and SpecPilot fell back to source search',
    );
  }

  readiness(): Promise<GraphReadiness> {
    return this.primary.readiness();
  }

  private async recover(
    operation: 'explore' | 'impact' | 'affected',
    runPrimary: () => Promise<GraphResult>,
    runFallback: () => Promise<GraphResult>,
  ): Promise<GraphResult> {
    try {
      return await runPrimary();
    } catch (error) {
      const result = await runFallback();
      return {
        ...result,
        operation,
        warnings: [`CodeGraph error: ${(error as Error).message}`, ...result.warnings],
      };
    }
  }

  explore(query: string): Promise<GraphResult> {
    return this.recover(
      'explore',
      () => this.primary.explore(query),
      () => this.fallback.explore(query),
    );
  }

  impact(symbol: string): Promise<GraphResult> {
    return this.recover(
      'impact',
      () => this.primary.impact(symbol),
      () => this.fallback.impact(symbol),
    );
  }

  affected(files: string[]): Promise<GraphResult> {
    return this.recover(
      'affected',
      () => this.primary.affected(files),
      () => this.fallback.affected(files),
    );
  }
}

export class UnavailableGraphAdapter implements GraphProvider {
  async readiness(): Promise<GraphReadiness> {
    return {
      provider: 'unavailable',
      available: false,
      indexed: false,
      stale: false,
      error: 'Graph support is disabled.',
    };
  }

  private result(operation: GraphResult['operation']): GraphResult {
    return {
      provider: 'unavailable',
      operation,
      advisory: true,
      needsSourceConfirmation: true,
      output: '',
      warnings: ['Graph support is disabled; inspect source and tests directly.'],
    };
  }

  explore(): Promise<GraphResult> {
    return Promise.resolve(this.result('explore'));
  }

  impact(): Promise<GraphResult> {
    return Promise.resolve(this.result('impact'));
  }

  affected(): Promise<GraphResult> {
    return Promise.resolve(this.result('affected'));
  }
}

export async function graphProvider(
  root: string,
  mode: 'codegraph' | 'none',
  executable = 'codegraph',
): Promise<GraphProvider> {
  if (mode === 'none') return new SourceFallbackAdapter(root);
  const codegraph = new CodeGraphAdapter(root, executable);
  const readiness = await codegraph.readiness();
  if (readiness.available && readiness.indexed && !readiness.stale) {
    return new ResilientCodeGraphAdapter(codegraph);
  }
  const reason = readiness.stale
    ? 'The CodeGraph index is stale'
    : readiness.error
      ? `CodeGraph is unavailable (${readiness.error})`
      : 'CodeGraph is unavailable or not indexed';
  return new SourceFallbackAdapter(root, reason);
}
