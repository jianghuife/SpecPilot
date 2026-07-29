import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

export type ChangeKind = 'light' | 'standard';
export type ChangeStatus = 'open' | 'closed';
export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked' | 'waived';
export type TaskExecution = 'standard' | 'tdd';

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
  waiver_reason?: string;
  filePath: string;
  body: string;
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
  const parsed = YAML.parse(normalized.slice(4, end));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${filePath} frontmatter must be an object`);
  }
  return {
    metadata: parsed as Record<string, unknown>,
    body: normalized.slice(end + 5).trimStart(),
  };
}

function parseChange(value: unknown, filePath: string): ChangeRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${filePath} must contain a YAML object`);
  }
  const record = value as Record<string, unknown>;
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
    waiver_reason: typeof metadata.waiver_reason === 'string' ? metadata.waiver_reason : undefined,
    filePath,
    body,
  };
}

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
    if (!/^[a-z0-9][a-z0-9-]*$/.test(changeId)) {
      throw new Error(`invalid change id: ${changeId}`);
    }
    return path.join(this.root, 'specs', 'changes', changeId);
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
