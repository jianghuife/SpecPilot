import { lstat, mkdir, readdir, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import YAML from 'yaml';
import {
  toPosixPath,
  writeJsonAtomic,
  writeTextAtomic,
  writeTextIfMissing,
} from '../utils/files.js';
import { assertSpecPilotId } from '../utils/identifiers.js';
import { isJsonObject } from '../utils/json.js';

export type ChangeKind = 'light' | 'standard';
export type ChangeStatus = 'open' | 'closed';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'waived';
export type TaskExecution = 'standard' | 'tdd';
export type TaskTransition = 'start' | 'complete' | 'block' | 'waive';
export type ReviewAxisStatus = 'pass' | 'pass_with_warnings' | 'blocked';
export type FindingAxis = 'standards' | 'spec';
export type FindingSeverity = 'blocking' | 'warning' | 'note';

export interface ReviewFindingEvidence {
  path: string;
  lines?: string;
}

export interface ReviewFinding {
  severity: FindingSeverity;
  title: string;
  evidence: ReviewFindingEvidence[];
  recommendation?: string;
}

export interface ReviewFindingsReport {
  schema_version: 1;
  reviewer: string;
  axis: FindingAxis;
  status: ReviewAxisStatus;
  findings: ReviewFinding[];
  filePath: string;
  // Content hash of the source findings file, recorded for reviewer attribution.
  sha256: string;
}

export interface ReviewerAttribution {
  id: string;
  axis: FindingAxis;
  findings_sha256: string;
}

export interface ChangeRecord {
  schema_version: 1;
  id: string;
  title: string;
  kind: ChangeKind;
  status: ChangeStatus;
  created_at: string;
  spec_approved_at?: string;
  closed_at?: string;
}

export interface TaskRecord {
  schema_version: 1;
  id: string;
  title: string;
  status: TaskStatus;
  blocked_by: string[];
  execution: TaskExecution;
  blocked_reason?: string;
  waiver_reason?: string;
  filePath: string;
  body: string;
}

export interface CreateChangeInput {
  id: string;
  title: string;
  kind: ChangeKind;
}

export interface CreateChangeResult {
  changeDirectory: string;
  writtenPaths: string[];
}

export interface AddTaskInput {
  id: string;
  title: string;
  execution?: TaskExecution;
  blockedBy?: string[];
}

export interface ReviewRecord {
  schema_version: 1;
  status: ReviewAxisStatus;
  standards: ReviewAxisStatus;
  spec: ReviewAxisStatus;
  reviewedAt: string;
  worktreeFingerprint: string;
  // Absent only in reviews written before spec fingerprinting; finish treats
  // a missing value as stale so those reviews must be re-recorded.
  specFingerprint?: string;
  // Absent only in reviews written before curated-context fingerprinting.
  reviewContextFingerprint?: string;
  // Absent only in reviews recorded without structured reviewer findings.
  reviewers?: ReviewerAttribution[];
  body: string;
}

export interface CloseChangeSummary {
  review?: string;
  finalEvidence?: string;
  knowledgeCandidates?: string[];
}

export interface WriteReviewInput {
  status: ReviewAxisStatus;
  standards: ReviewAxisStatus;
  spec: ReviewAxisStatus;
  reviewedAt: string;
  worktreeFingerprint: string;
  specFingerprint: string;
  reviewContextFingerprint: string;
  reviewers?: ReviewerAttribution[];
  body: string;
}

export type ContextPurpose = 'work' | 'review';

export interface ContextReference {
  path: string;
  reason: string;
}

export interface TaskContextManifest {
  schema_version: 1;
  change_id: string;
  task_id: string;
  work: ContextReference[];
  review: ContextReference[];
}

export interface ChangeInspection {
  change: ChangeRecord;
  tasks: {
    total: number;
    todo: number;
    doing: number;
    done: number;
    blocked: number;
    waived: number;
    tdd: number;
  };
  taskRecords: TaskRecord[];
  issues: string[];
}

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}

export function requireOpenChange(change: ChangeRecord): ChangeRecord {
  if (change.status !== 'open') {
    throw new Error(`change ${change.id} is not open`);
  }
  return change;
}

export function requireTask(tasks: TaskRecord[], changeId: string, taskId: string): TaskRecord {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) {
    throw new Error(`task ${taskId} does not exist in change ${changeId}`);
  }
  return task;
}

function assertContextPurpose(purpose: ContextPurpose): void {
  if (purpose !== 'work' && purpose !== 'review') {
    throw new Error('context purpose must be work or review');
  }
}

function parseFrontmatter(
  content: string,
  filePath: string,
): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const normalized = content.replaceAll('\r\n', '\n');
  if (!normalized.startsWith('---\n')) {
    throw new Error(`${filePath} is missing YAML frontmatter`);
  }
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) {
    throw new Error(`${filePath} has unterminated YAML frontmatter`);
  }
  const parsed: unknown = YAML.parse(normalized.slice(4, end));
  if (!isJsonObject(parsed)) {
    throw new Error(`${filePath} frontmatter must be an object`);
  }
  return {
    metadata: parsed,
    body: normalized.slice(end + 5).trimStart(),
  };
}

function parseChange(value: unknown, filePath: string): ChangeRecord {
  if (!isJsonObject(value)) {
    throw new Error(`${filePath} must contain a YAML object`);
  }
  const record = value;
  const kind = assertString(record.kind, 'kind');
  const status = assertString(record.status, 'status');
  if (record.schema_version !== 1) throw new Error(`${filePath} schema_version must be 1`);
  if (kind !== 'light' && kind !== 'standard') throw new Error(`${filePath} kind is invalid`);
  if (status !== 'open' && status !== 'closed') throw new Error(`${filePath} status is invalid`);
  return {
    schema_version: 1,
    id: assertString(record.id, 'id'),
    title: assertString(record.title, 'title'),
    kind,
    status,
    created_at: assertString(record.created_at, 'created_at'),
    spec_approved_at:
      typeof record.spec_approved_at === 'string' ? record.spec_approved_at : undefined,
    closed_at: typeof record.closed_at === 'string' ? record.closed_at : undefined,
  };
}

function parseTask(content: string, filePath: string): TaskRecord {
  const { metadata, body } = parseFrontmatter(content, filePath);
  const status = assertString(metadata.status, 'status');
  const execution = assertString(metadata.execution, 'execution');
  const blockedBy = metadata.blocked_by ?? [];
  if (metadata.schema_version !== 1) throw new Error(`${filePath} schema_version must be 1`);
  if (!['todo', 'doing', 'done', 'blocked', 'waived'].includes(status)) {
    throw new Error(`${filePath} task status is invalid`);
  }
  if (execution !== 'standard' && execution !== 'tdd') {
    throw new Error(`${filePath} task execution is invalid`);
  }
  if (!Array.isArray(blockedBy) || blockedBy.some((item) => typeof item !== 'string')) {
    throw new Error(`${filePath} blocked_by must be a string array`);
  }
  return {
    schema_version: 1,
    id: assertString(metadata.id, 'id'),
    title: assertString(metadata.title, 'title'),
    status: status as TaskStatus,
    blocked_by: blockedBy as string[],
    execution,
    blocked_reason:
      typeof metadata.blocked_reason === 'string' ? metadata.blocked_reason : undefined,
    waiver_reason: typeof metadata.waiver_reason === 'string' ? metadata.waiver_reason : undefined,
    filePath,
    body,
  };
}

function reviewStatus(value: unknown, field: string): ReviewAxisStatus {
  if (value === 'pass' || value === 'pass_with_warnings' || value === 'blocked') {
    return value;
  }
  throw new Error(`${field} must be pass, pass_with_warnings, or blocked`);
}

function findingAxis(value: unknown, field: string): FindingAxis {
  if (value === 'standards' || value === 'spec') return value;
  throw new Error(`${field} must be standards or spec`);
}

function findingSeverity(value: unknown, field: string): FindingSeverity {
  if (value === 'blocking' || value === 'warning' || value === 'note') return value;
  throw new Error(`${field} must be blocking, warning, or note`);
}

function reviewerAttributions(value: unknown, filePath: string): ReviewerAttribution[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new Error(`${filePath} reviewers must be an array`);
  }
  return value.map((item, index) => {
    if (!isJsonObject(item)) {
      throw new Error(`${filePath} reviewers[${index}] must be an object`);
    }
    return {
      id: assertString(item.id, `reviewers[${index}].id`),
      axis: findingAxis(item.axis, `reviewers[${index}].axis`),
      findings_sha256: assertString(item.findings_sha256, `reviewers[${index}].findings_sha256`),
    };
  });
}

function parseFindings(content: string, filePath: string): ReviewFindingsReport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${(error as Error).message}`);
  }
  if (!isJsonObject(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  if (parsed.schema_version !== 1) {
    throw new Error(`${filePath} schema_version must be 1`);
  }
  if (!Array.isArray(parsed.findings)) {
    throw new Error(`${filePath} findings must be an array`);
  }
  const findings: ReviewFinding[] = parsed.findings.map((item, index) => {
    const field = `${filePath} findings[${index}]`;
    if (!isJsonObject(item)) {
      throw new Error(`${field} must be an object`);
    }
    const severity = findingSeverity(item.severity, `${field}.severity`);
    const evidenceValue = item.evidence ?? [];
    if (!Array.isArray(evidenceValue)) {
      throw new Error(`${field}.evidence must be an array`);
    }
    const evidence: ReviewFindingEvidence[] = evidenceValue.map((entry, evidenceIndex) => {
      if (!isJsonObject(entry)) {
        throw new Error(`${field}.evidence[${evidenceIndex}] must be an object`);
      }
      return {
        path: assertString(entry.path, `${field}.evidence[${evidenceIndex}].path`),
        lines: typeof entry.lines === 'string' ? entry.lines : undefined,
      };
    });
    const title = assertString(item.title, `${field}.title`);
    if (severity === 'blocking' && evidence.length === 0) {
      throw new Error(`${field}: blocking finding "${title}" requires at least one evidence path`);
    }
    return {
      severity,
      title,
      evidence,
      recommendation: typeof item.recommendation === 'string' ? item.recommendation : undefined,
    };
  });
  return {
    schema_version: 1,
    reviewer: assertString(parsed.reviewer, 'reviewer'),
    axis: findingAxis(parsed.axis, 'axis'),
    status: reviewStatus(parsed.status, 'findings status'),
    findings,
    filePath,
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

function contextReferences(value: unknown, field: string): ContextReference[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array`);
  }
  return value.map((item, index) => {
    if (!isJsonObject(item)) {
      throw new Error(`${field}[${index}] must be an object`);
    }
    const reference = item;
    return {
      path: assertString(reference.path, `${field}[${index}].path`),
      reason: assertString(reference.reason, `${field}[${index}].reason`),
    };
  });
}

function normalizeContextPath(value: string, changeId: string): string {
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  const allowedPrefixes = ['specs/project/', 'specs/knowledge/', `specs/changes/${changeId}/`];
  if (
    path.posix.isAbsolute(normalized) ||
    normalized === 'specs' ||
    normalized.startsWith('../') ||
    !allowedPrefixes.some((prefix) => normalized.startsWith(prefix))
  ) {
    throw new Error('context references must stay inside specs/ for this project or change');
  }
  return normalized;
}

function contextScopePath(root: string, changeId: string, contextPath: string): string {
  if (contextPath.startsWith('specs/project/')) {
    return path.join(root, 'specs', 'project');
  }
  if (contextPath.startsWith('specs/knowledge/')) {
    return path.join(root, 'specs', 'knowledge');
  }
  return path.join(root, 'specs', 'changes', changeId);
}

function parseTaskContext(value: unknown, filePath: string): TaskContextManifest {
  if (!isJsonObject(value)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  const manifest = value;
  if (manifest.schema_version !== 1) {
    throw new Error(`${filePath} schema_version must be 1`);
  }
  const changeId = assertString(manifest.change_id, 'change_id');
  const taskId = assertString(manifest.task_id, 'task_id');
  const work = contextReferences(manifest.work, 'work').map((reference) => ({
    ...reference,
    path: normalizeContextPath(reference.path, changeId),
  }));
  const review = contextReferences(manifest.review, 'review').map((reference) => ({
    ...reference,
    path: normalizeContextPath(reference.path, changeId),
  }));
  return {
    schema_version: 1,
    change_id: changeId,
    task_id: taskId,
    work,
    review,
  };
}

function parseReview(content: string, filePath: string): ReviewRecord {
  const { metadata, body } = parseFrontmatter(content, filePath);
  if (metadata.schema_version !== 1) {
    throw new Error(`${filePath} schema_version must be 1`);
  }
  if (typeof metadata.reviewed_at !== 'string' || metadata.reviewed_at.trim() === '') {
    throw new Error(`${filePath} reviewed_at must be a non-empty string`);
  }
  if (
    typeof metadata.worktree_fingerprint !== 'string' ||
    metadata.worktree_fingerprint.trim() === ''
  ) {
    throw new Error(`${filePath} worktree_fingerprint must be a non-empty string`);
  }
  if (body.trim() === '') {
    throw new Error(`${filePath} review body must be non-empty`);
  }
  return {
    schema_version: 1,
    status: reviewStatus(metadata.status, 'review status'),
    standards: reviewStatus(metadata.standards, 'standards review'),
    spec: reviewStatus(metadata.spec, 'spec review'),
    reviewedAt: metadata.reviewed_at,
    worktreeFingerprint: metadata.worktree_fingerprint,
    specFingerprint:
      typeof metadata.spec_fingerprint === 'string' && metadata.spec_fingerprint.trim() !== ''
        ? metadata.spec_fingerprint
        : undefined,
    reviewContextFingerprint:
      typeof metadata.review_context_fingerprint === 'string' &&
      metadata.review_context_fingerprint.trim() !== ''
        ? metadata.review_context_fingerprint
        : undefined,
    reviewers: reviewerAttributions(metadata.reviewers, filePath),
    body,
  };
}

function documentTemplate(heading: string, title: string, sections: string[]): string {
  return `# ${heading}: ${title}\n\n${sections.map((section) => `## ${section}\n`).join('\n')}`;
}

function defaultTaskContext(change: ChangeRecord, taskId: string): TaskContextManifest {
  const documents: ContextReference[] = [
    {
      path: `specs/changes/${change.id}/spec.md`,
      reason: 'Approved change specification',
    },
  ];
  if (change.kind === 'standard') {
    documents.push(
      {
        path: `specs/changes/${change.id}/design.md`,
        reason: 'Approved change design',
      },
      {
        path: `specs/changes/${change.id}/plan.md`,
        reason: 'Approved implementation plan',
      },
    );
  }
  return {
    schema_version: 1,
    change_id: change.id,
    task_id: taskId,
    work: documents.map((reference) => ({ ...reference })),
    review: documents.map((reference) => ({ ...reference })),
  };
}

function taskContent(task: TaskRecord): string {
  const frontmatter: Record<string, unknown> = {
    schema_version: 1,
    id: task.id,
    title: task.title,
    status: task.status,
    blocked_by: task.blocked_by,
    execution: task.execution,
  };
  if (task.blocked_reason) frontmatter.blocked_reason = task.blocked_reason;
  if (task.waiver_reason) frontmatter.waiver_reason = task.waiver_reason;
  return `---\n${YAML.stringify(frontmatter)}---\n\n${task.body.trimEnd()}\n`;
}

const TASK_TRANSITIONS: Record<TaskStatus, Partial<Record<TaskTransition, TaskStatus>>> = {
  todo: { start: 'doing', block: 'blocked', waive: 'waived' },
  doing: { complete: 'done', block: 'blocked', waive: 'waived' },
  blocked: { start: 'doing', waive: 'waived' },
  done: {},
  waived: {},
};

function findDependencyIssues(tasks: TaskRecord[]): string[] {
  const issues: string[] = [];
  const byId = new Map(tasks.map((task) => [task.id, task]));
  for (const task of tasks) {
    for (const dependency of task.blocked_by) {
      if (!byId.has(dependency)) {
        issues.push(`task ${task.id} references missing dependency ${dependency}`);
      }
    }
  }

  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];

  const visit = (taskId: string): void => {
    if (visited.has(taskId)) return;
    if (visiting.has(taskId)) {
      const start = stack.indexOf(taskId);
      issues.push(`task dependency cycle: ${[...stack.slice(start), taskId].join(' -> ')}`);
      return;
    }
    visiting.add(taskId);
    stack.push(taskId);
    for (const dependency of byId.get(taskId)?.blocked_by ?? []) {
      if (byId.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(taskId);
    visited.add(taskId);
  };

  for (const task of tasks) visit(task.id);
  return [...new Set(issues)];
}

export class ProjectStore {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  changeDirectory(changeId: string): string {
    assertSpecPilotId(changeId, 'change id');
    return path.join(this.root, 'specs', 'changes', changeId);
  }

  taskContextPath(changeId: string, taskId: string): string {
    assertSpecPilotId(taskId, 'task id');
    return path.join(this.changeDirectory(changeId), 'context', `${taskId}.json`);
  }

  async listChangeIds(): Promise<string[]> {
    const directory = path.join(this.root, 'specs', 'changes');
    try {
      const entries = await readdir(directory, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async readChange(changeId: string): Promise<ChangeRecord> {
    const filePath = path.join(this.changeDirectory(changeId), 'change.yaml');
    return parseChange(YAML.parse(await readFile(filePath, 'utf8')), filePath);
  }

  async readTasks(changeId: string): Promise<TaskRecord[]> {
    const directory = path.join(this.changeDirectory(changeId), 'tasks');
    try {
      const entries = (await readdir(directory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
        .sort((left, right) => left.name.localeCompare(right.name));
      return Promise.all(
        entries.map(async (entry) => {
          const filePath = path.join(directory, entry.name);
          return parseTask(await readFile(filePath, 'utf8'), filePath);
        }),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }

  async createChange(input: CreateChangeInput): Promise<CreateChangeResult> {
    const directory = this.changeDirectory(input.id);
    const title = assertString(input.title, 'title');
    if (input.kind !== 'light' && input.kind !== 'standard') {
      throw new Error('kind must be light or standard');
    }
    const record: ChangeRecord = {
      schema_version: 1,
      id: input.id,
      title,
      kind: input.kind,
      status: 'open',
      created_at: new Date().toISOString(),
    };
    const changePath = path.join(directory, 'change.yaml');
    if (!(await writeTextIfMissing(changePath, YAML.stringify(record)))) {
      throw new Error(`change ${input.id} already exists`);
    }
    const writtenPaths = [toPosixPath(path.relative(this.root, changePath))];

    const documents: Record<string, string> = {
      'spec.md': documentTemplate('Spec', title, [
        'Goal',
        'Scope and non-goals',
        'Behavior',
        'Acceptance criteria',
        'Verification',
      ]),
    };
    if (input.kind === 'standard') {
      documents['design.md'] = documentTemplate('Design', title, [
        'Context',
        'Options and trade-offs',
        'Decision',
      ]);
      documents['plan.md'] = documentTemplate('Plan', title, ['Milestones', 'Task dependencies']);
    }
    for (const [name, content] of Object.entries(documents)) {
      const filePath = path.join(directory, name);
      if (await writeTextIfMissing(filePath, content)) {
        writtenPaths.push(toPosixPath(path.relative(this.root, filePath)));
      }
    }
    await mkdir(path.join(directory, 'tasks'), { recursive: true });
    return { changeDirectory: directory, writtenPaths };
  }

  async addTask(changeId: string, input: AddTaskInput): Promise<string> {
    const change = requireOpenChange(await this.readChange(changeId));
    assertSpecPilotId(input.id, 'task id');
    const title = assertString(input.title, 'title');
    const execution = input.execution ?? 'standard';
    if (execution !== 'standard' && execution !== 'tdd') {
      throw new Error('execution must be standard or tdd');
    }
    const blockedBy = input.blockedBy ?? [];
    if (blockedBy.some((item) => typeof item !== 'string' || item.trim() === '')) {
      throw new Error('blocked_by must contain non-empty task ids');
    }
    const filePath = path.join(this.changeDirectory(changeId), 'tasks', `${input.id}.md`);
    const frontmatter = YAML.stringify({
      schema_version: 1,
      id: input.id,
      title,
      status: 'todo',
      blocked_by: blockedBy,
      execution,
    });
    if (!(await writeTextIfMissing(filePath, `---\n${frontmatter}---\n\n# ${title}\n`))) {
      throw new Error(`task ${input.id} already exists in change ${changeId}`);
    }
    await writeJsonAtomic(
      this.taskContextPath(changeId, input.id),
      defaultTaskContext(change, input.id),
    );
    return filePath;
  }

  async readTaskContext(changeId: string, taskId: string): Promise<TaskContextManifest> {
    const filePath = this.taskContextPath(changeId, taskId);
    let manifest: TaskContextManifest;
    try {
      manifest = parseTaskContext(JSON.parse(await readFile(filePath, 'utf8')), filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const change = await this.readChange(changeId);
      if (!(await this.readTasks(changeId)).some((task) => task.id === taskId)) {
        throw new Error(`task ${taskId} does not exist in change ${changeId}`, { cause: error });
      }
      return defaultTaskContext(change, taskId);
    }
    if (manifest.change_id !== changeId || manifest.task_id !== taskId) {
      throw new Error(`${filePath} identity does not match ${changeId}/${taskId}`);
    }
    return manifest;
  }

  async contextArtifactExists(changeId: string, contextPath: string): Promise<boolean> {
    const normalized = normalizeContextPath(contextPath, changeId);
    try {
      const canonicalRoot = await realpath(this.root);
      const canonicalScope = await realpath(contextScopePath(this.root, changeId, normalized));
      const canonical = await realpath(path.join(this.root, normalized));
      return (
        canonicalScope.startsWith(`${canonicalRoot}${path.sep}`) &&
        canonical.startsWith(`${canonicalScope}${path.sep}`) &&
        (await lstat(canonical)).isFile()
      );
    } catch {
      return false;
    }
  }

  async addTaskContext(
    changeId: string,
    taskId: string,
    purpose: ContextPurpose,
    input: ContextReference,
  ): Promise<TaskContextManifest> {
    requireOpenChange(await this.readChange(changeId));
    requireTask(await this.readTasks(changeId), changeId, taskId);
    assertContextPurpose(purpose);
    const reference: ContextReference = {
      path: normalizeContextPath(assertString(input.path, 'context path'), changeId),
      reason: assertString(input.reason, 'context reason'),
    };
    if (!(await this.contextArtifactExists(changeId, reference.path))) {
      throw new Error(
        `context file is missing or outside its allowed artifact scope: ${reference.path}`,
      );
    }
    const manifest = await this.readTaskContext(changeId, taskId);
    const references = manifest[purpose];
    const existing = references.findIndex((candidate) => candidate.path === reference.path);
    if (existing >= 0) references[existing] = reference;
    else references.push(reference);
    await writeJsonAtomic(this.taskContextPath(changeId, taskId), manifest);
    return manifest;
  }

  async removeTaskContext(
    changeId: string,
    taskId: string,
    purpose: ContextPurpose,
    contextPath: string,
  ): Promise<TaskContextManifest> {
    requireOpenChange(await this.readChange(changeId));
    assertContextPurpose(purpose);
    const manifest = await this.readTaskContext(changeId, taskId);
    const normalized = normalizeContextPath(assertString(contextPath, 'context path'), changeId);
    manifest[purpose] = manifest[purpose].filter((reference) => reference.path !== normalized);
    await writeJsonAtomic(this.taskContextPath(changeId, taskId), manifest);
    return manifest;
  }

  async approveSpec(changeId: string): Promise<ChangeRecord> {
    const change = requireOpenChange(await this.readChange(changeId));
    try {
      await readFile(path.join(this.changeDirectory(changeId), 'spec.md'));
    } catch {
      throw new Error(`change ${changeId} has no spec.md; write the spec before approving it`);
    }
    const approved: ChangeRecord = { ...change, spec_approved_at: new Date().toISOString() };
    await writeTextAtomic(
      path.join(this.changeDirectory(changeId), 'change.yaml'),
      YAML.stringify(approved),
    );
    return approved;
  }

  async transitionTask(
    changeId: string,
    taskId: string,
    transition: TaskTransition,
    reason?: string,
  ): Promise<TaskRecord> {
    requireOpenChange(await this.readChange(changeId));
    const task = requireTask(await this.readTasks(changeId), changeId, taskId);
    if ((transition === 'block' || transition === 'waive') && !reason?.trim()) {
      throw new Error(`${transition} requires a reason`);
    }
    const nextStatus = TASK_TRANSITIONS[task.status][transition];
    if (!nextStatus) {
      throw new Error(`cannot transition task ${taskId} from ${task.status} with ${transition}`);
    }

    const updated: TaskRecord = {
      ...task,
      status: nextStatus,
      blocked_reason: transition === 'block' ? reason?.trim() : undefined,
      waiver_reason: transition === 'waive' ? reason?.trim() : undefined,
    };
    const content = taskContent(updated);
    await writeTextAtomic(task.filePath, content);
    return parseTask(content, task.filePath);
  }

  async writeReview(changeId: string, input: WriteReviewInput): Promise<ReviewRecord> {
    requireOpenChange(await this.readChange(changeId));
    const filePath = path.join(this.changeDirectory(changeId), 'review.md');
    const metadata: Record<string, unknown> = {
      schema_version: 1,
      status: reviewStatus(input.status, 'review status'),
      standards: reviewStatus(input.standards, 'standards review'),
      spec: reviewStatus(input.spec, 'spec review'),
      reviewed_at: assertString(input.reviewedAt, 'reviewed_at'),
      worktree_fingerprint: assertString(input.worktreeFingerprint, 'worktree_fingerprint'),
      spec_fingerprint: assertString(input.specFingerprint, 'spec_fingerprint'),
      review_context_fingerprint: assertString(
        input.reviewContextFingerprint,
        'review_context_fingerprint',
      ),
    };
    if (input.reviewers && input.reviewers.length > 0) {
      metadata.reviewers = reviewerAttributions(input.reviewers, 'review input');
    }
    const content = `---\n${YAML.stringify(metadata)}---\n\n${assertString(input.body, 'review body').trimEnd()}\n`;
    await writeTextAtomic(filePath, content);
    return parseReview(content, filePath);
  }

  async readReview(changeId: string): Promise<ReviewRecord> {
    const filePath = path.join(this.changeDirectory(changeId), 'review.md');
    return parseReview(await readFile(filePath, 'utf8'), filePath);
  }

  reviewFindingsDirectory(): string {
    return path.join(this.root, '.specpilot', 'local', 'review-findings');
  }

  // Blocking findings must cite real repository files: evidence paths resolve
  // against the repository root and symlink escapes are rejected, so a
  // reviewer (human or subagent) cannot anchor a gate to a fabricated path.
  private async evidenceFileExists(reference: string): Promise<boolean> {
    const normalized = path.posix.normalize(reference.replaceAll('\\', '/'));
    if (path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../')) {
      throw new Error(`evidence path escapes the repository: ${reference}`);
    }
    try {
      const canonicalRoot = await realpath(this.root);
      const canonical = await realpath(path.join(this.root, normalized));
      return (
        canonical.startsWith(`${canonicalRoot}${path.sep}`) && (await lstat(canonical)).isFile()
      );
    } catch {
      return false;
    }
  }

  async readFindingsReports(reference: string): Promise<ReviewFindingsReport[]> {
    const directory = this.reviewFindingsDirectory();
    const resolved = path.resolve(directory, assertString(reference, 'findings reference'));
    if (resolved !== directory && !resolved.startsWith(`${directory}${path.sep}`)) {
      throw new Error('findings reports must live under .specpilot/local/review-findings/');
    }
    let files: string[];
    const stats = await lstat(resolved).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new Error(`findings report not found: ${reference}`);
      }
      throw error;
    });
    if (stats.isDirectory()) {
      files = (await readdir(resolved))
        .filter((entry) => entry.endsWith('.json'))
        .sort()
        .map((entry) => path.join(resolved, entry));
    } else {
      if (!resolved.endsWith('.json')) {
        throw new Error(`findings report must be a JSON file: ${reference}`);
      }
      files = [resolved];
    }
    const reports: ReviewFindingsReport[] = [];
    for (const filePath of files) {
      const relative = toPosixPath(path.relative(this.root, filePath));
      const report = parseFindings(await readFile(filePath, 'utf8'), relative);
      for (const finding of report.findings) {
        for (const evidence of finding.evidence) {
          if (!(await this.evidenceFileExists(evidence.path))) {
            throw new Error(
              `${report.filePath}: evidence path does not exist in the repository: ${evidence.path}`,
            );
          }
        }
      }
      reports.push(report);
    }
    return reports;
  }

  // The worktree fingerprint deliberately excludes specs/**, so reviews pin
  // the change's approved documents separately: editing spec.md, design.md,
  // or plan.md after a review makes that review stale.
  async specFingerprint(changeId: string): Promise<string> {
    const directory = this.changeDirectory(changeId);
    const hash = createHash('sha256');
    for (const name of ['spec.md', 'design.md', 'plan.md']) {
      let content: Buffer;
      try {
        content = await readFile(path.join(directory, name));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        continue;
      }
      hash.update(name).update('\0').update(content).update('\0');
    }
    return hash.digest('hex');
  }

  async closeChange(changeId: string, summary: CloseChangeSummary = {}): Promise<ChangeRecord> {
    const inspection = await this.inspectChange(changeId);
    requireOpenChange(inspection.change);
    const closedAt = new Date().toISOString();
    const closed: ChangeRecord = {
      ...inspection.change,
      status: 'closed',
      closed_at: closedAt,
    };
    const changeDirectory = this.changeDirectory(changeId);
    await writeTextAtomic(path.join(changeDirectory, 'change.yaml'), YAML.stringify(closed));
    const candidates = summary.knowledgeCandidates ?? [];
    await writeTextAtomic(
      path.join(changeDirectory, 'summary.md'),
      `# Change Summary\n\n` +
        `- Change: ${inspection.change.title} (\`${inspection.change.id}\`)\n` +
        `- Closed: ${closedAt}\n` +
        `- Tasks: ${inspection.tasks.done} done, ${inspection.tasks.waived} waived\n` +
        `- Review: ${summary.review ?? 'recorded in review.md'}\n` +
        `- Final evidence: ${summary.finalEvidence ?? `recorded under .specpilot/evidence/${changeId}/`}\n\n` +
        `## Knowledge candidates\n\n` +
        (candidates.length > 0
          ? `${candidates.map((candidate) => `- ${candidate}`).join('\n')}\n\n`
          : `None pending.\n\n`) +
        `Review durable lessons before promoting them to \`specs/knowledge/\`; nothing is promoted automatically.\n`,
    );
    return closed;
  }

  async inspectChange(changeId: string): Promise<ChangeInspection> {
    const [change, taskRecords] = await Promise.all([
      this.readChange(changeId),
      this.readTasks(changeId),
    ]);
    const issues = findDependencyIssues(taskRecords);
    for (const task of taskRecords) {
      if (task.status === 'waived' && !task.waiver_reason?.trim()) {
        issues.push(`waived task ${task.id} requires waiver_reason`);
      }
    }
    return {
      change,
      tasks: {
        total: taskRecords.length,
        todo: taskRecords.filter((task) => task.status === 'todo').length,
        doing: taskRecords.filter((task) => task.status === 'doing').length,
        done: taskRecords.filter((task) => task.status === 'done').length,
        blocked: taskRecords.filter((task) => task.status === 'blocked').length,
        waived: taskRecords.filter((task) => task.status === 'waived').length,
        tdd: taskRecords.filter((task) => task.execution === 'tdd').length,
      },
      taskRecords,
      issues,
    };
  }
}

export { parseFrontmatter };
