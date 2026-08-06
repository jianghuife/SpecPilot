import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { toPosixPath, writeJsonAtomic, writeTextAtomic } from '../utils/files.js';
import { assertSpecPilotId } from '../utils/identifiers.js';

const execFileAsync = promisify(execFile);

export type EvidencePhase = 'red' | 'green' | 'final';

export interface RunEvidenceInput {
  changeId: string;
  taskId: string;
  phase: EvidencePhase;
  command: string[];
  reason?: string;
}

export interface EvidenceRecord {
  schema_version: 1;
  id: string;
  change_id: string;
  task_id: string;
  phase: EvidencePhase;
  command: string[];
  reason?: string;
  exit_code: number;
  valid: boolean;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  head: string;
  worktree_fingerprint: string;
  // Absent only in records written before context fingerprinting, or records
  // captured outside a valid SpecPilot change/task. Workflow gates never treat
  // an absent value as current context.
  context_fingerprint?: string;
  context_scope?: 'work' | 'change';
  log_path: string;
  record_path: string;
}

const OWNED_PREFIXES = [
  '.agents/',
  '.claude/',
  '.codex/',
  '.specpilot/',
  'specs/',
  'coverage/',
  'dist/',
  'node_modules/',
];

function isProjectCodePath(relativePath: string): boolean {
  const normalized = toPosixPath(relativePath);
  return !OWNED_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

async function gitOutput(root: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return '';
  }
}

async function untrackedContentDigest(root: string): Promise<string> {
  const output = await gitOutput(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  const paths = output.split('\0').filter(Boolean).filter(isProjectCodePath).sort();
  const hash = createHash('sha256');
  for (const relativePath of paths) {
    hash.update(relativePath);
    try {
      hash.update(await readFile(path.join(root, relativePath)));
    } catch {
      hash.update('<unreadable>');
    }
  }
  return hash.digest('hex');
}

async function runCommand(
  root: string,
  command: string[],
): Promise<{ exitCode: number; output: string; durationMs: number }> {
  if (command.length === 0) throw new Error('verification command cannot be empty');
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: root,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        output,
        durationMs: Date.now() - started,
      });
    });
  });
}

async function readEvidenceDirectory(directory: string): Promise<EvidenceRecord[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const records = await Promise.all(
      entries.map(async (entry): Promise<EvidenceRecord[]> => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return readEvidenceDirectory(entryPath);
        if (!entry.isFile() || !entry.name.endsWith('.json')) return [];
        try {
          return [JSON.parse(await readFile(entryPath, 'utf8')) as EvidenceRecord];
        } catch {
          return [];
        }
      }),
    );
    return records.flat();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export class EvidenceRunner {
  readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  async fingerprint(): Promise<{ head: string; fingerprint: string }> {
    const head = (await gitOutput(this.root, ['rev-parse', 'HEAD'])).trim() || 'unborn';
    const diff = await gitOutput(this.root, [
      'diff',
      '--binary',
      'HEAD',
      '--',
      '.',
      ':(exclude)specs/**',
      ':(exclude).specpilot/**',
      ':(exclude).agents/**',
      ':(exclude).claude/**',
      ':(exclude).codex/**',
      ':(exclude)coverage/**',
      ':(exclude)dist/**',
    ]);
    const untracked = await untrackedContentDigest(this.root);
    const fingerprint = createHash('sha256')
      .update(head)
      .update('\0')
      .update(diff)
      .update('\0')
      .update(untracked)
      .digest('hex');
    return { head, fingerprint };
  }

  async run(input: RunEvidenceInput): Promise<EvidenceRecord> {
    const changeId = assertSpecPilotId(input.changeId, 'change id');
    const taskId = assertSpecPilotId(input.taskId, 'task id');
    if (input.phase === 'red' && !input.reason?.trim()) {
      throw new Error('red evidence requires a reason describing the expected failure');
    }

    const { MemoryCatalog } = await import('../memory/memory-catalog.js');
    const memory = new MemoryCatalog(this.root);
    const contextScope: EvidenceRecord['context_scope'] =
      input.phase === 'final' ? 'change' : 'work';
    const context =
      input.phase === 'final'
        ? await memory.changeContextSnapshot(changeId)
        : await memory.contextSnapshot(changeId, taskId, 'work');
    if (context.missing.length > 0) {
      throw new Error(`verification context is missing: ${context.missing.join(', ')}`);
    }
    if (context.invalid.length > 0) {
      throw new Error(`verification context is untrusted: ${context.invalid.join(', ')}`);
    }
    if (!context.withinBudget) {
      throw new Error('verification context exceeds its configured byte budget');
    }
    const contextFingerprint = context.fingerprint;
    const startedAt = new Date();
    const result = await runCommand(this.root, input.command);
    const completedAt = new Date();
    const { head, fingerprint } = await this.fingerprint();
    const valid = input.phase === 'red' ? result.exitCode !== 0 : result.exitCode === 0;
    const timestamp = completedAt.toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const id = `${timestamp}-${input.phase}`;
    const directory = path.join(this.root, '.specpilot', 'evidence', changeId, taskId);
    const logPath = path.join(directory, `${id}.log`);
    const recordPath = path.join(directory, `${id}.json`);
    const relativeLogPath = toPosixPath(path.relative(this.root, logPath));
    const relativeRecordPath = toPosixPath(path.relative(this.root, recordPath));

    await writeTextAtomic(logPath, result.output);
    const record: EvidenceRecord = {
      schema_version: 1,
      id,
      change_id: changeId,
      task_id: taskId,
      phase: input.phase,
      command: input.command,
      reason: input.reason,
      exit_code: result.exitCode,
      valid,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: result.durationMs,
      head,
      worktree_fingerprint: fingerprint,
      context_fingerprint: contextFingerprint,
      context_scope: contextScope,
      log_path: relativeLogPath,
      record_path: relativeRecordPath,
    };
    await writeJsonAtomic(recordPath, record);
    return record;
  }

  async list(changeId?: string): Promise<EvidenceRecord[]> {
    const directory = changeId
      ? path.join(this.root, '.specpilot', 'evidence', assertSpecPilotId(changeId, 'change id'))
      : path.join(this.root, '.specpilot', 'evidence');
    return readEvidenceDirectory(directory);
  }

  async isFresh(record: EvidenceRecord): Promise<boolean> {
    const { fingerprint } = await this.fingerprint();
    if (!record.valid) return false;
    // Red is historical proof that the focused check failed before the
    // implementation. Like its code fingerprint, its context snapshot is
    // audit metadata rather than a freshness gate.
    if (record.phase === 'red') return true;
    if (record.worktree_fingerprint !== fingerprint) return false;
    if (!record.context_fingerprint) return false;
    try {
      const { MemoryCatalog } = await import('../memory/memory-catalog.js');
      const memory = new MemoryCatalog(this.root);
      const contextFingerprint =
        record.phase === 'final'
          ? (
              await memory.changeContextSnapshot(record.change_id, undefined, {
                validateKnowledge: false,
              })
            ).fingerprint
          : (
              await memory.contextSnapshot(record.change_id, record.task_id, 'work', {
                validateKnowledge: false,
              })
            ).fingerprint;
      return record.context_fingerprint === contextFingerprint;
    } catch {
      return false;
    }
  }
}
