import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { readProjectConfig } from '../project/config.js';
import { parseFrontmatter, ProjectStore, type ContextPurpose } from '../project/project-store.js';
import { DEFAULT_CONTEXT_MAX_BYTES } from '../types.js';
import { toPosixPath, writeJsonAtomic } from '../utils/files.js';
import { assertSpecPilotId } from '../utils/identifiers.js';
import { isJsonObject } from '../utils/json.js';
import {
  assessKnowledgeCoverage,
  knowledgePoliciesForPath,
  type KnowledgeCoverage,
  type KnowledgePriority,
} from './knowledge-policy.js';

interface MemoryIndexEntry {
  relativePath: string;
  title: string;
  domain?: string;
  summary?: string;
  searchable: string;
  sizeBytes: number;
  priority?: KnowledgePriority;
  authority?: string;
  loadPolicy?: string;
  knowledgeTypes: string[];
  template: boolean;
}

interface MemoryIndex {
  schema_version: 2;
  generated_at: string;
  source_fingerprint: string;
  entries: MemoryIndexEntry[];
}

export interface MemoryResult {
  relativePath: string;
  title: string;
  domain?: string;
  summary?: string;
  content: string;
  score: number;
  trust: 'project' | 'verified';
}

export interface ResolvedContextReference {
  path: string;
  reason: string;
  exists: boolean;
  trusted: boolean;
  issue?: string;
}

export interface TaskContextListing {
  changeId: string;
  taskId: string;
  purpose: ContextPurpose;
  references: ResolvedContextReference[];
  missing: string[];
  invalid: string[];
}

export interface TaskContextSnapshot extends TaskContextListing {
  fingerprint: string;
  totalBytes: number;
  budgetBytes: number;
  withinBudget: boolean;
  overBudgetBytes: number;
}

export interface ContextBudgetIssue {
  taskId: string;
  purpose: ContextPurpose;
  totalBytes: number;
  budgetBytes: number;
  overBudgetBytes: number;
}

export interface ChangeContextSnapshot {
  changeId: string;
  purposes: ContextPurpose[];
  fingerprint: string;
  snapshots: TaskContextSnapshot[];
  missing: string[];
  invalid: string[];
  totalBytes: number;
  withinBudget: boolean;
  overBudget: ContextBudgetIssue[];
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
  knowledge_policy_version: 2;
  generated_at: string;
  project_name: string;
  manifests: string[];
  source_roots: string[];
  test_roots: string[];
  languages: Record<string, number>;
  existing_memory: string[];
  knowledge_coverage: KnowledgeCoverage[];
  priority_summary: Record<
    KnowledgePriority,
    { covered: number; template: number; missing: number }
  >;
  review_status: 'pending';
}

export interface KnowledgeInitializationResult {
  reportPath: string;
  written: boolean;
  inventory: KnowledgeInventory;
}

export interface KnowledgeReviewReceipt {
  schema_version: 1;
  candidate_path: string;
  candidate_sha256: string;
  decision: 'approved' | 'rejected';
  reviewed_by: string;
  reviewed_at: string;
  reason: string;
}

export interface CandidateValidation {
  candidate: string;
  valid: boolean;
  issues: string[];
  receipt: 'approved' | 'rejected' | 'stale' | 'missing';
}

export interface KnowledgeAttestation {
  schema_version: 1;
  knowledge_path: string;
  knowledge_sha256: string;
  provenance_sha256: string;
  reviewed_by: string;
  reviewed_at: string;
  review_reason: string;
  attested_at: string;
}

export interface TrustedKnowledgeAuditEntry {
  relativePath: string;
  title: string;
  identity: string;
  status: 'trusted' | 'stale' | 'invalid' | 'conflict';
  issues: string[];
  sourceRefs?: string[];
  evidenceRefs?: string[];
  humanVerifiers?: string[];
  attested?: boolean;
  reviewedBy?: string;
}

export interface KnowledgeAuditReport {
  policy_version: 2;
  healthy: boolean;
  coverage: KnowledgeCoverage[];
  trusted_knowledge: TrustedKnowledgeAuditEntry[];
  summary: {
    trusted: number;
    stale: number;
    invalid: number;
    conflict: number;
  };
}

export interface ContextSuggestion {
  path: string;
  reason: string;
  score: number;
  sizeBytes: number;
  priority?: KnowledgePriority;
  authority?: string;
  loadPolicy?: string;
  knowledgeTypes: string[];
  matchedTerms: string[];
}

export interface ContextSuggestionReport {
  changeId: string;
  taskId: string;
  purpose: ContextPurpose;
  budgetBytes: number;
  existingBytes: number;
  selectedBytes: number;
  remainingBytes: number;
  selected: ContextSuggestion[];
  omitted: Array<ContextSuggestion & { omissionReason: 'budget' }>;
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
const KNOWLEDGE_AUDIT_SKIP_DIRECTORIES = new Set([
  '.claude',
  '.codex',
  '.git',
  '.specpilot',
  'coverage',
  'dist',
  'node_modules',
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

async function listTrustedKnowledgeFiles(root: string): Promise<string[]> {
  return (await markdownFiles(path.join(root, 'specs', 'knowledge')))
    .filter((filePath) => path.basename(filePath) !== 'index.md')
    .sort();
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

async function walkKnowledgeFiles(directory: string, root: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<string[]> => {
      if (entry.isDirectory() && KNOWLEDGE_AUDIT_SKIP_DIRECTORIES.has(entry.name)) return [];
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return walkKnowledgeFiles(entryPath, root);
      return entry.isFile() ? [toPosixPath(path.relative(root, entryPath))] : [];
    }),
  );
  return nested.flat();
}

function prioritySummary(
  coverage: KnowledgeCoverage[],
): Record<KnowledgePriority, { covered: number; template: number; missing: number }> {
  const summary = {
    p0: { covered: 0, template: 0, missing: 0 },
    p1: { covered: 0, template: 0, missing: 0 },
    p2: { covered: 0, template: 0, missing: 0 },
  };
  for (const item of coverage) summary[item.priority][item.status] += 1;
  return summary;
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

interface KnowledgeProvenance {
  sourceRefs: string[];
  evidenceRefs: string[];
  humanVerifiers: string[];
  watchPaths: string[];
  identity: string;
  title: string;
}

function timestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be an ISO timestamp`);
  }
  return value;
}

function objectField(value: unknown, field: string): Record<string, unknown> {
  if (!isJsonObject(value)) throw new Error(`${field} must be an object`);
  return value;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

function normalizedVerifier(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map((entry, index) => objectField(entry, `verified[${index}]`))
    : [objectField(value, 'verified')];
}

function validateOkfKnowledge(metadata: Record<string, unknown>): KnowledgeProvenance {
  const type = nonEmptyString(metadata.type, 'type');
  const title = nonEmptyString(metadata.title, 'title');
  nonEmptyString(metadata.description, 'description');
  const sources = metadata.sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    throw new Error('sources must be a non-empty array');
  }
  const sourceRefs = sources.map((entry, index) =>
    nonEmptyString(objectField(entry, `sources[${index}]`).resource, `sources[${index}].resource`),
  );

  const generated = objectField(metadata.generated, 'generated');
  nonEmptyString(generated.by, 'generated.by');
  const generatedAt = timestamp(generated.at, 'generated.at');
  const verified = normalizedVerifier(metadata.verified);
  const humanVerificationTimes = verified
    .map((entry, index) => ({
      by: nonEmptyString(entry.by, `verified[${index}].by`),
      at: timestamp(entry.at, `verified[${index}].at`),
    }))
    .filter((entry) => entry.by.startsWith('human:'))
    .map((entry) => entry.at);
  if (humanVerificationTimes.length === 0) {
    throw new Error('trusted SpecPilot knowledge requires human verification');
  }
  if (
    humanVerificationTimes.every((verifiedAt) => Date.parse(verifiedAt) < Date.parse(generatedAt))
  ) {
    throw new Error('human verification must not predate generated content');
  }

  const status = metadata.status ?? 'stable';
  if (status !== 'stable') {
    throw new Error('promoted knowledge status must be stable');
  }
  if (metadata.stale_after !== undefined) {
    const staleAfter = nonEmptyString(metadata.stale_after, 'stale_after');
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(staleAfter)) {
      throw new Error('stale_after must be an ISO date');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (today >= staleAfter) throw new Error('knowledge is stale according to stale_after');
  }

  const profile = objectField(metadata.specpilot, 'specpilot');
  nonEmptyString(profile.domain, 'specpilot.domain');
  if (!['p0', 'p1', 'p2'].includes(String(profile.criticality))) {
    throw new Error('specpilot.criticality must be p0, p1, or p2');
  }
  if (
    ![
      'normative',
      'contractual',
      'descriptive',
      'historical',
      'operational',
      'instructional',
    ].includes(String(profile.authority))
  ) {
    throw new Error('specpilot.authority is invalid');
  }
  if (
    ![
      'always',
      'required_when_matched',
      'recommended_when_matched',
      'on_demand',
      'host_managed',
    ].includes(String(profile.load_policy))
  ) {
    throw new Error('specpilot.load_policy is invalid');
  }
  const invalidation = objectField(profile.invalidation, 'specpilot.invalidation');
  nonEmptyString(invalidation.description, 'specpilot.invalidation.description');
  stringList(invalidation.watch_paths, 'specpilot.invalidation.watch_paths');
  return {
    sourceRefs,
    evidenceRefs: stringList(profile.evidence_refs, 'specpilot.evidence_refs'),
    humanVerifiers: verified
      .map((entry) => String(entry.by))
      .filter((actor) => actor.startsWith('human:')),
    watchPaths: stringList(invalidation.watch_paths, 'specpilot.invalidation.watch_paths'),
    identity: `${type.toLocaleLowerCase()}::${title.toLocaleLowerCase()}`,
    title,
  };
}

function validateKnowledge(content: string, filePath: string): KnowledgeProvenance {
  const { metadata } = parseFrontmatter(content, filePath);
  if (metadata.type !== undefined) return validateOkfKnowledge(metadata);
  const requiredStrings = ['domain', 'summary', 'invalidation_condition', 'verified_at'] as const;
  for (const field of requiredStrings) {
    if (typeof metadata[field] !== 'string' || metadata[field].trim() === '') {
      throw new Error(`${field} must be a non-empty string`);
    }
  }
  const sourceRefs = stringList(metadata.source_refs, 'source_refs');
  const evidenceRefs = stringList(metadata.evidence_refs, 'evidence_refs');
  if (Number.isNaN(Date.parse(metadata.verified_at as string))) {
    throw new Error('verified_at must be an ISO timestamp');
  }
  const title = titleOf(content, path.basename(filePath, '.md'));
  return {
    sourceRefs,
    evidenceRefs,
    humanVerifiers: [],
    watchPaths: [],
    identity: `${String(metadata.domain).toLocaleLowerCase()}::${title.toLocaleLowerCase()}`,
    title,
  };
}

function isExternalResource(reference: string): boolean {
  return /^https?:\/\//u.test(reference);
}

function safeRepositoryReference(root: string, reference: string, field: string): string {
  const normalized = toPosixPath(path.posix.normalize(reference.replaceAll('\\', '/')));
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('\0')
  ) {
    throw new Error(`${field} must be a safe repository-relative path: ${reference}`);
  }
  const resolved = path.resolve(root, normalized);
  if (resolved === root || !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${field} escapes the repository: ${reference}`);
  }
  return resolved;
}

function globPattern(pattern: string): RegExp {
  let expression = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        expression += '(?:.*/)?';
        index += 2;
      } else {
        expression += '.*';
        index += 1;
      }
    } else if (character === '*') {
      expression += '[^/]*';
    } else if (character === '?') {
      expression += '[^/]';
    } else {
      expression += '^$.*+?()[]{}|\\'.includes(character ?? '')
        ? `\\${character}`
        : (character ?? '');
    }
  }
  return new RegExp(`${expression}$`, 'u');
}

async function memorySourceFingerprint(root: string, files: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const filePath of files) {
    hash.update(toPosixPath(path.relative(root, filePath)));
    hash.update('\0');
    hash.update(await readFile(filePath));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function parseLocalSession(value: unknown): LocalSession {
  if (!isJsonObject(value)) {
    throw new Error('session.json must contain a valid SpecPilot local session');
  }
  const session = value;
  if (session.schema_version !== 1) {
    throw new Error(
      'session.json must contain a valid SpecPilot local session with schema_version 1',
    );
  }
  const activeChange =
    typeof session.active_change === 'string' ? session.active_change : undefined;
  const activeTask = typeof session.active_task === 'string' ? session.active_task : undefined;
  for (const [field, id] of [
    ['active_change', activeChange],
    ['active_task', activeTask],
  ] as const) {
    if (id) assertSpecPilotId(id, field);
  }
  if (activeTask && !activeChange) {
    throw new Error('active_task requires active_change');
  }
  const notes = session.notes ?? [];
  if (!Array.isArray(notes) || notes.some((note) => typeof note !== 'string')) {
    throw new Error('session.json notes must be a string array');
  }
  if (typeof session.updated_at !== 'string' || Number.isNaN(Date.parse(session.updated_at))) {
    throw new Error('session.json updated_at must be a valid timestamp');
  }
  return {
    schema_version: 1,
    active_change: activeChange,
    active_task: activeTask,
    notes: notes as string[],
    updated_at: session.updated_at,
  };
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

  private async contextMaxBytes(purpose?: ContextPurpose): Promise<number> {
    try {
      const context = (await readProjectConfig(this.root)).context;
      if (purpose === 'work' && context.work_bytes !== undefined) return context.work_bytes;
      if (purpose === 'review' && context.review_bytes !== undefined) return context.review_bytes;
      return context.max_bytes;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_CONTEXT_MAX_BYTES;
      throw error;
    }
  }

  private async rebuildIndex(files: string[], sourceFingerprint: string): Promise<MemoryIndex> {
    const entries = await Promise.all(
      files.map(async (filePath): Promise<MemoryIndexEntry> => {
        const content = await readFile(filePath, 'utf8');
        const relativePath = toPosixPath(path.relative(this.root, filePath));
        let domain: string | undefined;
        let summary: string | undefined;
        let title: string | undefined;
        let priority: KnowledgePriority | undefined;
        let authority: string | undefined;
        let loadPolicy: string | undefined;
        if (content.startsWith('---\n')) {
          try {
            const { metadata } = parseFrontmatter(content, filePath);
            const profile = isJsonObject(metadata.specpilot) ? metadata.specpilot : undefined;
            domain =
              typeof profile?.domain === 'string'
                ? profile.domain
                : typeof metadata.domain === 'string'
                  ? metadata.domain
                  : undefined;
            summary =
              typeof metadata.description === 'string'
                ? metadata.description
                : typeof metadata.summary === 'string'
                  ? metadata.summary
                  : undefined;
            title = typeof metadata.title === 'string' ? metadata.title : undefined;
            priority = ['p0', 'p1', 'p2'].includes(String(profile?.criticality))
              ? (profile?.criticality as KnowledgePriority)
              : undefined;
            loadPolicy = typeof profile?.load_policy === 'string' ? profile.load_policy : undefined;
            authority = typeof profile?.authority === 'string' ? profile.authority : undefined;
          } catch {
            // Project documents without valid knowledge frontmatter remain searchable.
          }
        }
        const policies = knowledgePoliciesForPath(relativePath);
        priority ??= policies
          .map((policy) => policy.priority)
          .sort((left, right) => left.localeCompare(right))[0];
        return {
          relativePath,
          title: title ?? titleOf(content, path.basename(filePath, '.md')),
          domain,
          summary,
          searchable: `${domain ?? ''} ${summary ?? ''} ${content}`.toLocaleLowerCase(),
          sizeBytes: Buffer.byteLength(content),
          priority,
          authority,
          loadPolicy,
          knowledgeTypes: policies.map((policy) => policy.id),
          template: /<!--\s*specpilot-template:[a-z0-9-]+\s*-->/u.test(content),
        };
      }),
    );
    const index: MemoryIndex = {
      schema_version: 2,
      generated_at: new Date().toISOString(),
      source_fingerprint: sourceFingerprint,
      entries,
    };
    await writeJsonAtomic(this.cachePath, index);
    return index;
  }

  async refresh(): Promise<MemoryIndex> {
    const files = await listMemoryFiles(this.root);
    return this.rebuildIndex(files, await memorySourceFingerprint(this.root, files));
  }

  private async index(): Promise<MemoryIndex> {
    const files = await listMemoryFiles(this.root);
    const sourceFingerprint = await memorySourceFingerprint(this.root, files);
    try {
      const value = JSON.parse(await readFile(this.cachePath, 'utf8')) as MemoryIndex;
      if (
        value.schema_version === 2 &&
        value.source_fingerprint === sourceFingerprint &&
        Array.isArray(value.entries)
      ) {
        return value;
      }
    } catch {
      // The index is disposable and can always be rebuilt from Markdown.
    }
    return this.rebuildIndex(files, sourceFingerprint);
  }

  async search(query: string, limit = 8): Promise<MemoryResult[]> {
    const tokens = words(query);
    const index = await this.index();
    const trustedKnowledge = new Map(
      (await this.inspectTrustedKnowledge()).map((entry) => [entry.relativePath, entry]),
    );
    const ranked = index.entries
      .map((entry) => ({
        entry,
        score: tokens.reduce(
          (score, token) => score + (entry.searchable.includes(token) ? 1 : 0),
          0,
        ),
      }))
      .filter(({ entry, score }) => {
        if (tokens.length > 0 && score === 0) return false;
        if (!entry.relativePath.startsWith('specs/knowledge/')) return true;
        return trustedKnowledge.get(entry.relativePath)?.status === 'trusted';
      })
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
        trust: entry.relativePath.startsWith('specs/knowledge/') ? 'verified' : 'project',
      })),
    );
  }

  async suggestContext(
    changeId: string,
    taskId: string,
    purpose: ContextPurpose,
  ): Promise<ContextSuggestionReport> {
    const store = new ProjectStore(this.root);
    const change = await store.readChange(changeId);
    const task = (await store.readTasks(changeId)).find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`task ${taskId} does not exist in change ${changeId}`);
    const current = await this.contextSnapshot(changeId, taskId, purpose);
    if (current.missing.length > 0 || current.invalid.length > 0) {
      throw new Error('repair missing or untrusted context before requesting suggestions');
    }
    // The approved spec (plus design/plan for standard changes) carries most of
    // the change's vocabulary; titles and task bodies alone under-represent it.
    const documentNames = [
      'spec.md',
      ...(change.kind === 'standard' ? ['design.md', 'plan.md'] : []),
    ];
    const documentParts: string[] = [];
    for (const name of documentNames) {
      try {
        documentParts.push(
          await readFile(path.join(store.changeDirectory(changeId), name), 'utf8'),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    const queryTokens = [
      ...new Set(words(`${change.title} ${task.title} ${task.body} ${documentParts.join('\n')}`)),
    ];
    const existing = new Set(current.references.map((reference) => reference.path));
    const trustedKnowledge = new Map(
      (await this.inspectTrustedKnowledge()).map((entry) => [entry.relativePath, entry]),
    );
    const priorityWeight: Record<KnowledgePriority, number> = { p0: 30, p1: 20, p2: 10 };
    const authorityWeight: Record<string, number> = {
      normative: 40,
      contractual: 35,
      operational: 25,
      instructional: 20,
      descriptive: 10,
      historical: 0,
    };
    const loadPolicyWeight: Record<string, number> = {
      always: 100,
      required_when_matched: 50,
      recommended_when_matched: 25,
      on_demand: 0,
      host_managed: -100,
    };
    const candidates = (await this.index()).entries
      .filter((entry) => !entry.template && !existing.has(entry.relativePath))
      .filter((entry) => entry.loadPolicy !== 'host_managed')
      .filter(
        (entry) =>
          !entry.relativePath.startsWith('specs/knowledge/') ||
          trustedKnowledge.get(entry.relativePath)?.status === 'trusted',
      )
      .map((entry): ContextSuggestion | undefined => {
        const matchedTerms = queryTokens.filter((token) => entry.searchable.includes(token));
        if (matchedTerms.length === 0 && entry.loadPolicy !== 'always') return undefined;
        const priority = entry.priority;
        const score =
          matchedTerms.length * 10 +
          (priority ? priorityWeight[priority] : 0) +
          (entry.authority ? (authorityWeight[entry.authority] ?? 0) : 0) +
          (entry.loadPolicy ? (loadPolicyWeight[entry.loadPolicy] ?? 0) : 0);
        const reason =
          entry.loadPolicy === 'always' && matchedTerms.length === 0
            ? 'The verified knowledge load policy is always.'
            : `Matched task terms ${matchedTerms.join(', ')}${
                entry.knowledgeTypes.length > 0 ? ` in ${entry.knowledgeTypes.join(', ')}` : ''
              }.`;
        return {
          path: entry.relativePath,
          reason,
          score,
          sizeBytes: entry.sizeBytes,
          priority,
          authority: entry.authority,
          loadPolicy: entry.loadPolicy,
          knowledgeTypes: entry.knowledgeTypes,
          matchedTerms,
        };
      })
      .filter((entry): entry is ContextSuggestion => entry !== undefined)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.sizeBytes - right.sizeBytes ||
          left.path.localeCompare(right.path),
      );
    let remainingBytes = Math.max(0, current.budgetBytes - current.totalBytes);
    const selected: ContextSuggestion[] = [];
    const omitted: Array<ContextSuggestion & { omissionReason: 'budget' }> = [];
    for (const candidate of candidates) {
      if (candidate.sizeBytes <= remainingBytes) {
        selected.push(candidate);
        remainingBytes -= candidate.sizeBytes;
      } else {
        omitted.push({ ...candidate, omissionReason: 'budget' });
      }
    }
    const selectedBytes = selected.reduce((total, item) => total + item.sizeBytes, 0);
    return {
      changeId,
      taskId,
      purpose,
      budgetBytes: current.budgetBytes,
      existingBytes: current.totalBytes,
      selectedBytes,
      remainingBytes,
      selected,
      omitted,
    };
  }

  private async provenanceFingerprint(provenance: KnowledgeProvenance): Promise<string> {
    const hash = createHash('sha256');
    for (const sourceRef of [...provenance.sourceRefs].sort()) {
      hash.update(`source:${sourceRef}\0`);
      if (isExternalResource(sourceRef)) continue;
      const sourcePath = safeRepositoryReference(this.root, sourceRef, 'source reference');
      hash.update(await readFile(sourcePath));
      hash.update('\0');
    }
    let repositoryFiles: string[] | undefined;
    for (const watchPath of [...provenance.watchPaths].sort()) {
      const resolved = safeRepositoryReference(this.root, watchPath, 'invalidation watch path');
      let watchedFiles: string[] = [];
      if (/[*?]/u.test(watchPath)) {
        repositoryFiles ??= await walkKnowledgeFiles(this.root, this.root);
        const matcher = globPattern(watchPath);
        watchedFiles = repositoryFiles.filter((relativePath) => matcher.test(relativePath));
      } else {
        try {
          const metadata = await lstat(resolved);
          watchedFiles = metadata.isDirectory()
            ? await walkKnowledgeFiles(resolved, this.root)
            : metadata.isFile()
              ? [toPosixPath(path.relative(this.root, resolved))]
              : [];
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      watchedFiles.sort();
      hash.update(`watch:${watchPath}\0`);
      if (watchedFiles.length === 0) hash.update('<missing>');
      for (const relativePath of watchedFiles) {
        hash.update(relativePath);
        hash.update('\0');
        hash.update(await readFile(path.join(this.root, relativePath)));
        hash.update('\0');
      }
    }
    return hash.digest('hex');
  }

  private attestationPath(knowledgePath: string): string {
    return `${knowledgePath.slice(0, -'.md'.length)}.attestation.json`;
  }

  private async readAttestation(knowledgePath: string): Promise<KnowledgeAttestation | undefined> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.attestationPath(knowledgePath), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    if (!isJsonObject(value) || value.schema_version !== 1) {
      throw new Error('knowledge attestation must use schema_version 1');
    }
    const knowledgeSha256 = nonEmptyString(value.knowledge_sha256, 'knowledge_sha256');
    const provenanceSha256 = nonEmptyString(value.provenance_sha256, 'provenance_sha256');
    if (!/^[a-f0-9]{64}$/u.test(knowledgeSha256) || !/^[a-f0-9]{64}$/u.test(provenanceSha256)) {
      throw new Error('knowledge attestation fingerprints must be SHA-256 digests');
    }
    return {
      schema_version: 1,
      knowledge_path: nonEmptyString(value.knowledge_path, 'knowledge_path'),
      knowledge_sha256: knowledgeSha256,
      provenance_sha256: provenanceSha256,
      reviewed_by: nonEmptyString(value.reviewed_by, 'reviewed_by'),
      reviewed_at: timestamp(value.reviewed_at, 'reviewed_at'),
      review_reason: nonEmptyString(value.review_reason, 'review_reason'),
      attested_at: timestamp(value.attested_at, 'attested_at'),
    };
  }

  private async assertKnowledgeProvenance(
    provenance: KnowledgeProvenance,
    requireCurrentEvidence: boolean,
  ): Promise<void> {
    for (const watchPath of provenance.watchPaths) {
      safeRepositoryReference(this.root, watchPath, 'invalidation watch path');
    }
    for (const sourceRef of provenance.sourceRefs) {
      if (isExternalResource(sourceRef)) continue;
      const sourcePath = safeRepositoryReference(this.root, sourceRef, 'source reference');
      try {
        if (!(await lstat(sourcePath)).isFile()) throw new Error('not a file');
      } catch {
        throw new Error(`source reference does not exist: ${sourceRef}`);
      }
    }
    const { EvidenceRunner } = await import('../evidence/evidence-runner.js');
    const evidenceRunner = new EvidenceRunner(this.root);
    const evidenceRecords = await evidenceRunner.list();
    for (const evidenceRef of provenance.evidenceRefs) {
      safeRepositoryReference(this.root, evidenceRef, 'evidence reference');
      if (!evidenceRef.startsWith('.specpilot/evidence/') || !evidenceRef.endsWith('.json')) {
        throw new Error(`evidence reference must name an evidence JSON record: ${evidenceRef}`);
      }
      const record = evidenceRecords.find((candidate) => candidate.record_path === evidenceRef);
      if (!record || (requireCurrentEvidence && !(await evidenceRunner.isFresh(record)))) {
        throw new Error(`evidence reference is missing, invalid, or stale: ${evidenceRef}`);
      }
      if (!record.valid) {
        throw new Error(`evidence reference is not valid: ${evidenceRef}`);
      }
      if (record.phase !== 'green' && record.phase !== 'final') {
        throw new Error(`knowledge evidence must be green or final: ${evidenceRef}`);
      }
      try {
        if (!(await lstat(path.join(this.root, record.log_path))).isFile())
          throw new Error('missing');
      } catch {
        throw new Error(`evidence log does not exist: ${record.log_path}`);
      }
    }
  }

  private async inspectTrustedKnowledge(): Promise<TrustedKnowledgeAuditEntry[]> {
    const entries = await Promise.all(
      (await listTrustedKnowledgeFiles(this.root)).map(
        async (filePath): Promise<TrustedKnowledgeAuditEntry> => {
          const relativePath = toPosixPath(path.relative(this.root, filePath));
          const content = await readFile(filePath, 'utf8');
          let provenance: KnowledgeProvenance;
          let attestation: KnowledgeAttestation | undefined;
          try {
            provenance = validateKnowledge(content, filePath);
            await this.assertKnowledgeProvenance(provenance, false);
            attestation = await this.readAttestation(filePath);
            if (attestation) {
              if (attestation.knowledge_path !== relativePath) {
                throw new Error('knowledge attestation names a different concept');
              }
              const knowledgeSha256 = createHash('sha256').update(content).digest('hex');
              if (attestation.knowledge_sha256 !== knowledgeSha256) {
                throw new Error('knowledge content changed after attestation');
              }
              if (
                attestation.provenance_sha256 !== (await this.provenanceFingerprint(provenance))
              ) {
                throw new Error('knowledge is stale because invalidation inputs changed');
              }
            } else {
              // Concepts promoted before attestations were introduced remain
              // compatible only while their original evidence is still current.
              await this.assertKnowledgeProvenance(provenance, true);
            }
          } catch (error) {
            const issue = (error as Error).message;
            return {
              relativePath,
              title: titleOf(content, path.basename(filePath, '.md')),
              identity: relativePath,
              status: issue.includes('stale') ? 'stale' : 'invalid',
              issues: [issue],
            };
          }
          return {
            relativePath,
            title: provenance.title,
            identity: provenance.identity,
            status: 'trusted',
            issues: [],
            sourceRefs: provenance.sourceRefs,
            evidenceRefs: provenance.evidenceRefs,
            humanVerifiers: provenance.humanVerifiers,
            attested: attestation !== undefined,
            reviewedBy: attestation?.reviewed_by,
          };
        },
      ),
    );
    const byIdentity = new Map<string, TrustedKnowledgeAuditEntry[]>();
    for (const entry of entries) {
      const group = byIdentity.get(entry.identity) ?? [];
      group.push(entry);
      byIdentity.set(entry.identity, group);
    }
    for (const group of byIdentity.values()) {
      if (group.length < 2) continue;
      const paths = group.map((entry) => entry.relativePath).join(', ');
      for (const entry of group) {
        entry.status = 'conflict';
        entry.issues.push(`duplicate knowledge identity: ${paths}`);
      }
    }
    return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  async auditKnowledge(): Promise<KnowledgeAuditReport> {
    const trustedKnowledge = await this.inspectTrustedKnowledge();
    const summary = { trusted: 0, stale: 0, invalid: 0, conflict: 0 };
    for (const entry of trustedKnowledge) summary[entry.status] += 1;
    return {
      policy_version: 2,
      healthy: summary.stale === 0 && summary.invalid === 0 && summary.conflict === 0,
      coverage: await this.knowledgeCoverage(),
      trusted_knowledge: trustedKnowledge,
      summary,
    };
  }

  async contextFor(
    changeId: string,
    taskId: string,
    purpose: ContextPurpose,
    options: { validateKnowledge?: boolean } = {},
  ): Promise<TaskContextListing> {
    const store = new ProjectStore(this.root);
    const manifest = await store.readTaskContext(changeId, taskId);
    const knowledge =
      options.validateKnowledge === false
        ? new Map<string, TrustedKnowledgeAuditEntry>()
        : new Map(
            (await this.inspectTrustedKnowledge()).map((entry) => [entry.relativePath, entry]),
          );
    const references = await Promise.all(
      manifest[purpose].map(async (reference): Promise<ResolvedContextReference> => {
        const exists = await store.contextArtifactExists(changeId, reference.path);
        const audit = reference.path.startsWith('specs/knowledge/')
          ? knowledge.get(reference.path)
          : undefined;
        const trusted =
          exists &&
          (options.validateKnowledge === false ||
            !reference.path.startsWith('specs/knowledge/') ||
            audit?.status === 'trusted');
        return {
          ...reference,
          exists,
          trusted,
          issue:
            exists && !trusted
              ? (audit?.issues.join('; ') ?? 'knowledge is not a trusted OKF concept')
              : undefined,
        };
      }),
    );
    return {
      changeId,
      taskId,
      purpose,
      references,
      missing: references
        .filter((reference) => !reference.exists)
        .map((reference) => reference.path),
      invalid: references
        .filter((reference) => reference.exists && !reference.trusted)
        .map((reference) => reference.path),
    };
  }

  async contextSnapshot(
    changeId: string,
    taskId: string,
    purpose: ContextPurpose,
    options: { validateKnowledge?: boolean } = {},
  ): Promise<TaskContextSnapshot> {
    const listing = await this.contextFor(changeId, taskId, purpose, options);
    const hash = createHash('sha256');
    hash.update(JSON.stringify({ changeId, taskId, purpose }));
    let totalBytes = 0;
    for (const reference of listing.references) {
      hash.update('\0');
      hash.update(JSON.stringify({ path: reference.path, reason: reference.reason }));
      hash.update('\0');
      if (!reference.exists || !reference.trusted) {
        hash.update(reference.exists ? '<untrusted>' : '<missing>');
        continue;
      }
      const content = await readFile(path.join(this.root, reference.path));
      totalBytes += content.byteLength;
      hash.update(content);
    }
    const budgetBytes = await this.contextMaxBytes(purpose);
    return {
      ...listing,
      fingerprint: hash.digest('hex'),
      totalBytes,
      budgetBytes,
      withinBudget: totalBytes <= budgetBytes,
      overBudgetBytes: Math.max(0, totalBytes - budgetBytes),
    };
  }

  async changeContextSnapshot(
    changeId: string,
    purpose?: ContextPurpose,
    options: { validateKnowledge?: boolean } = {},
  ): Promise<ChangeContextSnapshot> {
    const store = new ProjectStore(this.root);
    const tasks = (await store.readTasks(changeId))
      .filter((task) => task.status !== 'waived')
      .sort((left, right) => left.id.localeCompare(right.id));
    const purposes: ContextPurpose[] = purpose ? [purpose] : ['work', 'review'];
    const snapshots: TaskContextSnapshot[] = [];
    for (const task of tasks) {
      for (const selectedPurpose of purposes) {
        snapshots.push(await this.contextSnapshot(changeId, task.id, selectedPurpose, options));
      }
    }
    const hash = createHash('sha256');
    hash.update(JSON.stringify({ changeId, purposes }));
    for (const snapshot of snapshots) {
      hash.update('\0');
      hash.update(
        JSON.stringify({
          taskId: snapshot.taskId,
          purpose: snapshot.purpose,
          fingerprint: snapshot.fingerprint,
        }),
      );
    }
    const overBudget = snapshots
      .filter((snapshot) => !snapshot.withinBudget)
      .map(
        (snapshot): ContextBudgetIssue => ({
          taskId: snapshot.taskId,
          purpose: snapshot.purpose,
          totalBytes: snapshot.totalBytes,
          budgetBytes: snapshot.budgetBytes,
          overBudgetBytes: snapshot.overBudgetBytes,
        }),
      );
    return {
      changeId,
      purposes,
      fingerprint: hash.digest('hex'),
      snapshots,
      missing: snapshots.flatMap((snapshot) => snapshot.missing),
      invalid: snapshots.flatMap((snapshot) => snapshot.invalid),
      totalBytes: snapshots.reduce((total, snapshot) => total + snapshot.totalBytes, 0),
      withinBudget: overBudget.length === 0,
      overBudget,
    };
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
    const knowledgeCoverage = await this.knowledgeCoverage();
    const inventory: KnowledgeInventory = {
      schema_version: 1,
      knowledge_policy_version: 2,
      generated_at: new Date().toISOString(),
      project_name: projectName,
      manifests: [...manifests],
      source_roots: sourceRoots,
      test_roots: testRoots,
      languages,
      existing_memory: existingMemory,
      knowledge_coverage: knowledgeCoverage,
      priority_summary: prioritySummary(knowledgeCoverage),
      review_status: 'pending',
    };
    const reportPath = path.join(this.root, '.specpilot', 'local', 'knowledge-init.json');
    if (!options.dryRun) {
      await writeJsonAtomic(reportPath, inventory);
      await this.refresh();
    }
    return { reportPath, written: !options.dryRun, inventory };
  }

  async knowledgeCoverage(): Promise<KnowledgeCoverage[]> {
    const paths = (await walkKnowledgeFiles(this.root, this.root)).sort();
    const files = await Promise.all(
      paths.map(async (relativePath) => {
        let templateId: string | undefined;
        if (relativePath.endsWith('.md')) {
          const content = await readFile(path.join(this.root, relativePath), 'utf8');
          templateId = /<!--\s*specpilot-template:([a-z0-9-]+)\s*-->/u.exec(content)?.[1];
        }
        return { path: relativePath, templateId };
      }),
    );
    return assessKnowledgeCoverage(files);
  }

  private resolveCandidatePath(candidatePath: string): string {
    const resolved = path.resolve(candidatePath);
    const allowedRoot = path.join(this.root, '.specpilot', 'local', 'knowledge-candidates');
    if (
      (resolved !== allowedRoot && !resolved.startsWith(`${allowedRoot}${path.sep}`)) ||
      !resolved.endsWith('.md')
    ) {
      throw new Error(
        'knowledge candidates must be Markdown files under .specpilot/local/knowledge-candidates',
      );
    }
    return resolved;
  }

  private reviewReceiptPath(candidatePath: string): string {
    return `${candidatePath.slice(0, -'.md'.length)}.review.json`;
  }

  async listKnowledgeCandidates(): Promise<string[]> {
    const directory = path.join(this.root, '.specpilot', 'local', 'knowledge-candidates');
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => toPosixPath(path.relative(this.root, path.join(directory, entry.name))))
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async reviewCandidate(
    candidatePath: string,
    input: {
      decision: 'approved' | 'rejected';
      reviewer: string;
      reason: string;
    },
  ): Promise<KnowledgeReviewReceipt> {
    const resolved = this.resolveCandidatePath(candidatePath);
    if (input.decision !== 'approved' && input.decision !== 'rejected') {
      throw new Error('knowledge review decision must be approved or rejected');
    }
    const reviewer = nonEmptyString(input.reviewer, 'reviewer');
    if (!reviewer.startsWith('human:')) {
      throw new Error('knowledge reviewer must use the human:<id> actor convention');
    }
    const content = await readFile(resolved);
    const receipt: KnowledgeReviewReceipt = {
      schema_version: 1,
      candidate_path: toPosixPath(path.relative(this.root, resolved)),
      candidate_sha256: createHash('sha256').update(content).digest('hex'),
      decision: input.decision,
      reviewed_by: reviewer,
      reviewed_at: new Date().toISOString(),
      reason: nonEmptyString(input.reason, 'review reason'),
    };
    await writeJsonAtomic(this.reviewReceiptPath(resolved), receipt);
    return receipt;
  }

  // Read-only preflight for knowledge candidates: drafters get the same
  // contract and provenance checks promotion runs, plus the receipt state,
  // without needing to attempt a review or promotion to discover errors.
  async validateCandidate(candidatePath: string): Promise<CandidateValidation> {
    const resolved = this.resolveCandidatePath(candidatePath);
    const issues: string[] = [];
    let content: string | undefined;
    try {
      content = await readFile(resolved, 'utf8');
      const provenance = validateKnowledge(content, resolved);
      await this.assertKnowledgeProvenance(provenance, true);
    } catch (error) {
      issues.push((error as Error).message);
    }
    let receipt: CandidateValidation['receipt'] = 'missing';
    try {
      const value: unknown = JSON.parse(await readFile(this.reviewReceiptPath(resolved), 'utf8'));
      if (isJsonObject(value) && value.schema_version === 1) {
        if (value.decision === 'rejected') {
          receipt = 'rejected';
        } else if (value.decision === 'approved') {
          const hash =
            content === undefined ? undefined : createHash('sha256').update(content).digest('hex');
          receipt = value.candidate_sha256 === hash ? 'approved' : 'stale';
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    return {
      candidate: toPosixPath(path.relative(this.root, resolved)),
      valid: issues.length === 0,
      issues,
      receipt,
    };
  }

  private async readCandidateReview(candidatePath: string): Promise<KnowledgeReviewReceipt> {
    let value: unknown;
    try {
      value = JSON.parse(await readFile(this.reviewReceiptPath(candidatePath), 'utf8'));
    } catch {
      throw new Error('knowledge promotion requires an approved review receipt');
    }
    if (!isJsonObject(value) || value.schema_version !== 1 || value.decision !== 'approved') {
      throw new Error('knowledge promotion requires an approved review receipt');
    }
    const reviewedBy = nonEmptyString(value.reviewed_by, 'reviewed_by');
    if (!reviewedBy.startsWith('human:')) {
      throw new Error('knowledge promotion requires a human review receipt');
    }
    const candidateSha256 = nonEmptyString(value.candidate_sha256, 'candidate_sha256');
    if (!/^[a-f0-9]{64}$/u.test(candidateSha256)) {
      throw new Error('candidate_sha256 must be a SHA-256 digest');
    }
    return {
      schema_version: 1,
      candidate_path: nonEmptyString(value.candidate_path, 'candidate_path'),
      candidate_sha256: candidateSha256,
      decision: 'approved',
      reviewed_by: reviewedBy,
      reviewed_at: timestamp(value.reviewed_at, 'reviewed_at'),
      reason: nonEmptyString(value.reason, 'review reason'),
    };
  }

  async promote(candidatePath: string): Promise<string> {
    const resolved = this.resolveCandidatePath(candidatePath);
    const content = await readFile(resolved, 'utf8');
    const provenance = validateKnowledge(content, resolved);
    const review = await this.readCandidateReview(resolved);
    const candidateRelativePath = toPosixPath(path.relative(this.root, resolved));
    if (review.candidate_path !== candidateRelativePath) {
      throw new Error('knowledge review receipt names a different candidate');
    }
    const candidateHash = createHash('sha256').update(content).digest('hex');
    if (review.candidate_sha256 !== candidateHash) {
      throw new Error('knowledge candidate changed after review');
    }
    if (
      provenance.humanVerifiers.length > 0 &&
      !provenance.humanVerifiers.includes(review.reviewed_by)
    ) {
      throw new Error('review receipt actor must match an OKF human verifier');
    }
    await this.assertKnowledgeProvenance(provenance, true);
    const destination = path.join(this.root, 'specs', 'knowledge', path.basename(resolved));
    const attestationPath = this.attestationPath(destination);
    try {
      await lstat(attestationPath);
      throw new Error(`knowledge attestation already exists: ${attestationPath}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await cp(resolved, destination, { force: false });
    const attestation: KnowledgeAttestation = {
      schema_version: 1,
      knowledge_path: toPosixPath(path.relative(this.root, destination)),
      knowledge_sha256: createHash('sha256').update(content).digest('hex'),
      provenance_sha256: await this.provenanceFingerprint(provenance),
      reviewed_by: review.reviewed_by,
      reviewed_at: review.reviewed_at,
      review_reason: review.reason,
      attested_at: new Date().toISOString(),
    };
    await writeJsonAtomic(attestationPath, attestation);
    await this.refresh();
    return destination;
  }

  async activateSession(
    activeChange?: string,
    activeTask?: string,
    notes: string[] = [],
  ): Promise<LocalSession> {
    const session = parseLocalSession({
      schema_version: 1,
      active_change: activeChange,
      active_task: activeTask,
      notes,
      updated_at: new Date().toISOString(),
    });
    await writeJsonAtomic(this.sessionPath, session);
    return session;
  }

  async clearSession(): Promise<void> {
    await rm(this.sessionPath, { force: true });
  }

  async readSession(): Promise<LocalSession | undefined> {
    let content: string;
    try {
      content = await readFile(this.sessionPath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
    try {
      return parseLocalSession(JSON.parse(content));
    } catch {
      // A corrupt session pointer cannot be trusted, so it degrades to "no
      // session" instead of failing status/resume; the next activation
      // rewrites the file.
      return undefined;
    }
  }
}

export { validateKnowledge };
