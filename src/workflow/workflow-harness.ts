import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import {
  type EvidencePhase,
  type EvidenceRecord,
  EvidenceRunner,
} from '../evidence/evidence-runner.js';
import { parseFrontmatter, ProjectStore } from '../project/project-store.js';
import { writeTextAtomic } from '../utils/files.js';

type ReviewAxisStatus = 'pass' | 'pass_with_warnings' | 'blocked';

interface ReviewRecord {
  status: ReviewAxisStatus;
  standards: ReviewAxisStatus;
  spec: ReviewAxisStatus;
  reviewedAt: string;
}

export interface FinishResult {
  changeId: string;
  status: 'ready' | 'blocked' | 'closed';
  missing: string[];
  warnings: string[];
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function reviewStatus(value: unknown, field: string): ReviewAxisStatus {
  if (value === 'pass' || value === 'pass_with_warnings' || value === 'blocked') {
    return value;
  }
  throw new Error(`${field} must be pass, pass_with_warnings, or blocked`);
}

async function readReview(filePath: string): Promise<ReviewRecord> {
  const { metadata } = parseFrontmatter(await readFile(filePath, 'utf8'), filePath);
  if (metadata.schema_version !== 1) {
    throw new Error(`${filePath} schema_version must be 1`);
  }
  if (typeof metadata.reviewed_at !== 'string' || metadata.reviewed_at.trim() === '') {
    throw new Error(`${filePath} reviewed_at must be a non-empty string`);
  }
  return {
    status: reviewStatus(metadata.status, 'review status'),
    standards: reviewStatus(metadata.standards, 'standards review'),
    spec: reviewStatus(metadata.spec, 'spec review'),
    reviewedAt: metadata.reviewed_at,
  };
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

function latestFreshEvidence(
  records: EvidenceRecord[],
  taskId: string,
  phase: EvidencePhase,
  fingerprint: string,
): EvidenceRecord | undefined {
  return records
    .filter(
      (record) =>
        record.schema_version === 1 &&
        record.valid === true &&
        record.task_id === taskId &&
        record.phase === phase &&
        record.worktree_fingerprint === fingerprint,
    )
    .sort((left, right) => right.completed_at.localeCompare(left.completed_at))[0];
}

export class WorkflowHarness {
  readonly root: string;
  readonly store: ProjectStore;
  readonly evidence: EvidenceRunner;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.store = new ProjectStore(this.root);
    this.evidence = new EvidenceRunner(this.root);
  }

  async finish(changeId: string, options: { apply?: boolean } = {}): Promise<FinishResult> {
    const inspection = await this.store.inspectChange(changeId);
    const changeDirectory = this.store.changeDirectory(changeId);
    const missing = [...inspection.issues];
    const warnings: string[] = [];

    if (inspection.change.status === 'closed') {
      return { changeId, status: 'closed', missing: [], warnings: [] };
    }
    if (!(await exists(path.join(changeDirectory, 'spec.md')))) {
      missing.push('spec.md is missing');
    }
    if (inspection.change.kind === 'standard') {
      if (!(await exists(path.join(changeDirectory, 'design.md')))) {
        missing.push('standard change is missing design.md');
      }
      if (!(await exists(path.join(changeDirectory, 'plan.md')))) {
        missing.push('standard change is missing plan.md');
      }
    }
    if (inspection.taskRecords.length === 0) {
      missing.push('change has no tasks');
    }
    for (const task of inspection.taskRecords) {
      if (task.status !== 'done' && task.status !== 'waived') {
        missing.push(`task ${task.id} is ${task.status}`);
      }
    }

    const reviewPath = path.join(changeDirectory, 'review.md');
    if (!(await exists(reviewPath))) {
      missing.push('review.md is missing');
    } else {
      try {
        const review = await readReview(reviewPath);
        if (
          review.status === 'blocked' ||
          review.standards === 'blocked' ||
          review.spec === 'blocked'
        ) {
          missing.push('review contains a blocking result');
        }
        if (
          review.status === 'pass_with_warnings' ||
          review.standards === 'pass_with_warnings' ||
          review.spec === 'pass_with_warnings'
        ) {
          warnings.push('review passed with warnings');
        }
      } catch (error) {
        missing.push(`review.md is invalid: ${(error as Error).message}`);
      }
    }

    const evidenceRecords = await readEvidenceDirectory(
      path.join(this.root, '.specpilot', 'evidence', changeId),
    );
    const { fingerprint } = await this.evidence.fingerprint();
    const latestFinal = evidenceRecords
      .filter(
        (record) =>
          record.schema_version === 1 &&
          record.valid === true &&
          record.phase === 'final' &&
          record.worktree_fingerprint === fingerprint,
      )
      .sort((left, right) => right.completed_at.localeCompare(left.completed_at))[0];
    if (!latestFinal) {
      missing.push('change is missing fresh final evidence');
    }
    for (const task of inspection.taskRecords.filter(
      (record) => record.execution === 'tdd' && record.status !== 'waived',
    )) {
      const red = latestFreshEvidence(evidenceRecords, task.id, 'red', fingerprint);
      const green = latestFreshEvidence(evidenceRecords, task.id, 'green', fingerprint);
      if (!red) {
        missing.push(`task ${task.id} is missing fresh red evidence`);
      }
      if (!green) {
        missing.push(`task ${task.id} is missing fresh green evidence`);
      }
      if (red && green && red.completed_at >= green.completed_at) {
        missing.push(`task ${task.id} must record red before green`);
      }
      if (green && latestFinal && green.completed_at > latestFinal.completed_at) {
        missing.push(`final evidence must be recorded after task ${task.id} green evidence`);
      }
    }

    if (missing.length > 0) {
      return { changeId, status: 'blocked', missing: [...new Set(missing)], warnings };
    }
    if (!options.apply) {
      return { changeId, status: 'ready', missing: [], warnings };
    }

    const closedAt = new Date().toISOString();
    const closedChange = { ...inspection.change, status: 'closed' as const, closed_at: closedAt };
    await writeTextAtomic(path.join(changeDirectory, 'change.yaml'), YAML.stringify(closedChange));
    await writeTextAtomic(
      path.join(changeDirectory, 'summary.md'),
      `# Change Summary\n\n` +
        `- Change: ${inspection.change.title} (\`${inspection.change.id}\`)\n` +
        `- Closed: ${closedAt}\n` +
        `- Tasks: ${inspection.tasks.done} done, ${inspection.tasks.waived} waived\n` +
        `- Review: passed\n` +
        `- Final evidence: current worktree verified\n\n` +
        `## Knowledge candidates\n\n` +
        `Review durable lessons before promoting them to \`specs/knowledge/\`.\n`,
    );
    return { changeId, status: 'closed', missing: [], warnings };
  }
}

export { readEvidenceDirectory };
