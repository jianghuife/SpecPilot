import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  type EvidencePhase,
  type EvidenceRecord,
  EvidenceRunner,
} from '../evidence/evidence-runner.js';
import { MemoryCatalog, type LocalSession } from '../memory/memory-catalog.js';
import {
  ProjectStore,
  requireOpenChange,
  requireTask,
  type ChangeRecord,
  type FindingAxis,
  type ReviewAxisStatus,
  type ReviewFindingsReport,
  type ReviewRecord,
  type ReviewerAttribution,
  type TaskRecord,
  type TaskTransition,
} from '../project/project-store.js';
import { toPosixPath } from '../utils/files.js';

export interface FinishResult {
  changeId: string;
  status: 'ready' | 'blocked' | 'closed';
  missing: string[];
  warnings: string[];
  knowledgeCandidates: string[];
}

export type WorkflowEntry =
  | 'specpilot-start'
  | 'specpilot-work'
  | 'specpilot-review'
  | 'specpilot-finish';

export interface WorkflowStateSnapshot {
  active: {
    change?: string;
    task?: string;
    changeStatus?: 'open' | 'closed';
    taskStatus?: TaskRecord['status'];
    stale: boolean;
  } | null;
  next: WorkflowEntry;
  context?: {
    purpose: 'work' | 'review';
    count: number;
    missing: string[];
    invalid: string[];
  };
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

function reviewIsBlocking(review: ReviewRecord): boolean {
  return review.status === 'blocked' || review.standards === 'blocked' || review.spec === 'blocked';
}

const AXIS_RANK: Record<ReviewAxisStatus, number> = { pass: 0, pass_with_warnings: 1, blocked: 2 };
const AXES: FindingAxis[] = ['standards', 'spec'];

// Structured reviewer findings set a floor for each axis: a blocking finding
// forces `blocked`, a warning forces at least `pass_with_warnings`. The harness
// owns this aggregation so reviewers cannot be talked into a lower status.
function axisFloor(reports: ReviewFindingsReport[], axis: FindingAxis): ReviewAxisStatus {
  const severities = reports
    .filter((report) => report.axis === axis)
    .flatMap((report) => report.findings.map((finding) => finding.severity));
  if (severities.includes('blocking')) return 'blocked';
  if (severities.includes('warning')) return 'pass_with_warnings';
  return 'pass';
}

function axisLabel(axis: FindingAxis): string {
  return axis === 'standards' ? 'Standards' : 'Spec';
}

function mergeFindingsIntoBody(body: string, reports: ReviewFindingsReport[]): string {
  let merged = body.trimEnd();
  for (const axis of AXES) {
    const axisReports = reports
      .filter((report) => report.axis === axis && report.findings.length > 0)
      .sort((left, right) => left.reviewer.localeCompare(right.reviewer));
    for (const report of axisReports) {
      merged += `\n\n## ${axisLabel(axis)} findings (reviewer: ${report.reviewer})\n`;
      for (const finding of report.findings) {
        const evidence = finding.evidence
          .map((entry) => (entry.lines ? `${entry.path}:${entry.lines}` : entry.path))
          .join(', ');
        merged += `\n- **${finding.severity}** ${finding.title}${evidence ? ` (${evidence})` : ''}`;
        if (finding.recommendation) {
          merged += `\n  Recommendation: ${finding.recommendation}`;
        }
      }
      merged += '\n';
    }
  }
  return `${merged}\n`;
}

function isUnfinished(status: TaskRecord['status'] | undefined): boolean {
  return status !== 'done' && status !== 'waived';
}

function latestEvidence(
  records: EvidenceRecord[],
  changeId: string,
  taskId: string,
  phase: EvidencePhase,
  fingerprint?: string,
  contextFingerprint?: string,
): EvidenceRecord | undefined {
  return records
    .filter(
      (record) =>
        record.schema_version === 1 &&
        record.valid === true &&
        record.change_id === changeId &&
        record.task_id === taskId &&
        record.phase === phase &&
        (fingerprint === undefined || record.worktree_fingerprint === fingerprint) &&
        (contextFingerprint === undefined || record.context_fingerprint === contextFingerprint),
    )
    .sort((left, right) => right.completed_at.localeCompare(left.completed_at))[0];
}

export class WorkflowHarness {
  readonly root: string;
  readonly store: ProjectStore;
  readonly evidence: EvidenceRunner;
  readonly memory: MemoryCatalog;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.store = new ProjectStore(this.root);
    this.evidence = new EvidenceRunner(this.root);
    this.memory = new MemoryCatalog(this.root);
  }

  async currentState(): Promise<WorkflowStateSnapshot> {
    const session = await this.memory.readSession();
    if (!session?.active_change) {
      return { active: null, next: 'specpilot-start' };
    }

    let inspection;
    try {
      inspection = await this.store.inspectChange(session.active_change);
    } catch (error) {
      // Only a missing change directory means the pointer is stale; IO or
      // contract failures must surface instead of masquerading as staleness.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return {
        active: {
          change: session.active_change,
          task: session.active_task,
          stale: true,
        },
        next: 'specpilot-start',
      };
    }
    const task = session.active_task
      ? inspection.taskRecords.find((candidate) => candidate.id === session.active_task)
      : undefined;
    const stale =
      inspection.change.status !== 'open' || (session.active_task !== undefined && !task);
    if (stale) {
      return {
        active: {
          change: session.active_change,
          task: session.active_task,
          changeStatus: inspection.change.status,
          stale: true,
        },
        next: 'specpilot-start',
      };
    }

    const unfinished = inspection.taskRecords.some((candidate) => isUnfinished(candidate.status));
    let next: WorkflowEntry;
    let purpose: 'work' | 'review';
    if (inspection.taskRecords.length === 0) {
      next = 'specpilot-start';
      purpose = 'work';
    } else if (unfinished) {
      next = 'specpilot-work';
      purpose = 'work';
    } else {
      purpose = 'review';
      try {
        const review = await this.store.readReview(session.active_change);
        next = reviewIsBlocking(review) ? 'specpilot-review' : 'specpilot-finish';
      } catch {
        next = 'specpilot-review';
      }
    }

    let context: WorkflowStateSnapshot['context'];
    if (task) {
      const listing = await this.memory.contextFor(session.active_change, task.id, purpose);
      context = {
        purpose,
        count: listing.references.length,
        missing: listing.missing,
        invalid: listing.invalid,
      };
    }
    return {
      active: {
        change: session.active_change,
        task: session.active_task,
        changeStatus: inspection.change.status,
        taskStatus: task?.status,
        stale: false,
      },
      next,
      context,
    };
  }

  async activateSession(changeId: string, taskId?: string): Promise<LocalSession> {
    const inspection = await this.store.inspectChange(changeId);
    requireOpenChange(inspection.change);
    if (taskId) requireTask(inspection.taskRecords, changeId, taskId);
    return this.memory.activateSession(changeId, taskId);
  }

  async clearSession(): Promise<void> {
    await this.memory.clearSession();
  }

  async approveSpec(changeId: string): Promise<ChangeRecord> {
    return this.store.approveSpec(changeId);
  }

  async recordReview(
    changeId: string,
    input: {
      standards: ReviewAxisStatus;
      spec: ReviewAxisStatus;
      body: string;
      findings?: string[];
    },
  ): Promise<ReviewRecord> {
    const inspection = await this.store.inspectChange(changeId);
    requireOpenChange(inspection.change);
    if (!inspection.change.spec_approved_at) {
      throw new Error(`change ${changeId} cannot be reviewed until the spec is approved`);
    }
    const reports: ReviewFindingsReport[] = [];
    for (const reference of input.findings ?? []) {
      reports.push(...(await this.store.readFindingsReports(reference)));
    }
    for (const axis of AXES) {
      const floor = axisFloor(reports, axis);
      if (AXIS_RANK[input[axis]] < AXIS_RANK[floor]) {
        throw new Error(
          floor === 'blocked'
            ? `${axis} findings contain blocking findings; record ${axis} as blocked or resolve them first`
            : `${axis} findings contain warnings; record ${axis} as pass_with_warnings or blocked`,
        );
      }
    }
    const reviewers: ReviewerAttribution[] = reports
      .map((report) => ({ id: report.reviewer, axis: report.axis, findings_sha256: report.sha256 }))
      .sort(
        (left, right) => left.axis.localeCompare(right.axis) || left.id.localeCompare(right.id),
      );
    const status: ReviewAxisStatus =
      input.standards === 'blocked' || input.spec === 'blocked'
        ? 'blocked'
        : input.standards === 'pass_with_warnings' || input.spec === 'pass_with_warnings'
          ? 'pass_with_warnings'
          : 'pass';
    // Missing review context always blocks a review write; only a passing
    // review additionally requires every task to be finished.
    for (const task of inspection.taskRecords.filter((task) => task.status !== 'waived')) {
      const context = await this.memory.contextSnapshot(changeId, task.id, 'review');
      if (context.missing.length > 0) {
        throw new Error(
          `task ${task.id} has missing review context: ${context.missing.join(', ')}`,
        );
      }
      if (context.invalid.length > 0) {
        throw new Error(
          `task ${task.id} has untrusted review context: ${context.invalid.join(', ')}`,
        );
      }
      if (!context.withinBudget) {
        throw new Error(
          `task ${task.id} review context exceeds its ${context.budgetBytes}-byte budget by ${context.overBudgetBytes} bytes`,
        );
      }
    }
    if (status !== 'blocked') {
      const unfinished = inspection.taskRecords.filter((task) => isUnfinished(task.status));
      if (unfinished.length > 0) {
        throw new Error(
          `change ${changeId} has unfinished tasks: ${unfinished.map((task) => task.id).join(', ')}`,
        );
      }
    }
    const { fingerprint } = await this.evidence.fingerprint();
    const reviewContext = await this.memory.changeContextSnapshot(changeId, 'review');
    return this.store.writeReview(changeId, {
      status,
      standards: input.standards,
      spec: input.spec,
      reviewedAt: new Date().toISOString(),
      worktreeFingerprint: fingerprint,
      specFingerprint: await this.store.specFingerprint(changeId),
      reviewContextFingerprint: reviewContext.fingerprint,
      reviewers: reviewers.length > 0 ? reviewers : undefined,
      body: mergeFindingsIntoBody(input.body, reports),
    });
  }

  async transitionTask(
    changeId: string,
    taskId: string,
    transition: TaskTransition,
    reason?: string,
  ): Promise<TaskRecord> {
    const inspection = await this.store.inspectChange(changeId);
    requireOpenChange(inspection.change);
    const task = requireTask(inspection.taskRecords, changeId, taskId);

    if (transition === 'start') {
      if (!inspection.change.spec_approved_at) {
        throw new Error(`task ${taskId} cannot start until the spec is approved`);
      }
      const byId = new Map(inspection.taskRecords.map((candidate) => [candidate.id, candidate]));
      const unsatisfied = task.blocked_by.filter((dependency) =>
        isUnfinished(byId.get(dependency)?.status),
      );
      if (unsatisfied.length > 0) {
        throw new Error(`task ${taskId} has unsatisfied dependencies: ${unsatisfied.join(', ')}`);
      }
      const context = await this.memory.contextSnapshot(changeId, taskId, 'work');
      if (context.missing.length > 0) {
        throw new Error(`task ${taskId} has missing work context: ${context.missing.join(', ')}`);
      }
      if (context.invalid.length > 0) {
        throw new Error(`task ${taskId} has untrusted work context: ${context.invalid.join(', ')}`);
      }
      if (!context.withinBudget) {
        throw new Error(
          `task ${taskId} work context exceeds its ${context.budgetBytes}-byte budget by ${context.overBudgetBytes} bytes`,
        );
      }
    }

    if (transition === 'complete') {
      const { fingerprint } = await this.evidence.fingerprint();
      const records = await this.evidence.list(changeId);
      const greenForCode = latestEvidence(records, changeId, taskId, 'green', fingerprint);
      if (!greenForCode) {
        throw new Error(`task ${taskId} requires fresh green evidence before completion`);
      }
      const context = await this.memory.contextSnapshot(changeId, taskId, 'work');
      const greenForContext = latestEvidence(
        records,
        changeId,
        taskId,
        'green',
        fingerprint,
        context.fingerprint,
      );
      if (!greenForContext) {
        throw new Error(`task ${taskId} requires green evidence for the current work context`);
      }
    }

    const updated = await this.store.transitionTask(changeId, taskId, transition, reason);
    if (transition === 'start') {
      await this.activateSession(changeId, taskId);
    }
    return updated;
  }

  private async knowledgeCandidates(): Promise<string[]> {
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

  async finish(changeId: string, options: { apply?: boolean } = {}): Promise<FinishResult> {
    const inspection = await this.store.inspectChange(changeId);
    const changeDirectory = this.store.changeDirectory(changeId);
    const missing = [...inspection.issues];
    const warnings: string[] = [];
    const knowledgeCandidates = await this.knowledgeCandidates();

    if (inspection.change.status === 'closed') {
      return { changeId, status: 'closed', missing: [], warnings: [], knowledgeCandidates };
    }
    if (!(await exists(path.join(changeDirectory, 'spec.md')))) {
      missing.push('spec.md is missing');
    }
    if (!inspection.change.spec_approved_at) {
      missing.push('change is missing spec_approved_at');
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
      if (isUnfinished(task.status)) {
        missing.push(`task ${task.id} is ${task.status}`);
      }
      if (task.status !== 'waived') {
        for (const purpose of ['work', 'review'] as const) {
          const context = await this.memory.contextSnapshot(changeId, task.id, purpose);
          if (context.missing.length > 0) {
            missing.push(
              `task ${task.id} has missing ${purpose} context: ${context.missing.join(', ')}`,
            );
          }
          if (context.invalid.length > 0) {
            missing.push(
              `task ${task.id} has untrusted ${purpose} context: ${context.invalid.join(', ')}`,
            );
          }
          if (!context.withinBudget) {
            missing.push(
              `task ${task.id} ${purpose} context exceeds its ${context.budgetBytes}-byte budget by ${context.overBudgetBytes} bytes`,
            );
          }
        }
      }
    }

    const { fingerprint } = await this.evidence.fingerprint();
    const changeContext = await this.memory.changeContextSnapshot(changeId);
    const reviewContext = await this.memory.changeContextSnapshot(changeId, 'review');
    const reviewPath = path.join(changeDirectory, 'review.md');
    let review: ReviewRecord | undefined;
    if (!(await exists(reviewPath))) {
      missing.push('review.md is missing');
    } else {
      try {
        review = await this.store.readReview(changeId);
        if (reviewIsBlocking(review)) {
          missing.push('review contains a blocking result');
        }
        if (review.worktreeFingerprint !== fingerprint) {
          missing.push('review is stale: the worktree changed after review');
        }
        // The worktree fingerprint excludes specs/**, so spec edits are pinned
        // separately; a review without a spec fingerprint predates this gate.
        if (review.specFingerprint !== (await this.store.specFingerprint(changeId))) {
          missing.push('review is stale: the spec documents changed after review');
        }
        if (review.reviewContextFingerprint !== reviewContext.fingerprint) {
          missing.push('review is stale: curated review context changed');
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

    const evidenceRecords = await this.evidence.list(changeId);
    const latestFinal = evidenceRecords
      .filter(
        (record) =>
          record.schema_version === 1 &&
          record.valid === true &&
          record.change_id === changeId &&
          record.phase === 'final' &&
          record.worktree_fingerprint === fingerprint &&
          record.context_fingerprint === changeContext.fingerprint,
      )
      .sort((left, right) => right.completed_at.localeCompare(left.completed_at))[0];
    if (!latestFinal) {
      missing.push('change is missing fresh final evidence');
    }
    for (const task of inspection.taskRecords.filter(
      (record) => record.execution === 'tdd' && record.status !== 'waived',
    )) {
      // Red evidence predates the implementation by definition, so it can never
      // match the final worktree fingerprint; ordering and the shared command tie
      // it to the fresh green run instead.
      const workContext = await this.memory.contextSnapshot(changeId, task.id, 'work');
      const red = latestEvidence(evidenceRecords, changeId, task.id, 'red');
      const green = latestEvidence(
        evidenceRecords,
        changeId,
        task.id,
        'green',
        fingerprint,
        workContext.fingerprint,
      );
      if (!red) {
        missing.push(`task ${task.id} is missing red evidence`);
      }
      if (!green) {
        missing.push(`task ${task.id} is missing fresh green evidence`);
      }
      if (red && green && red.completed_at >= green.completed_at) {
        missing.push(`task ${task.id} must record red before green`);
      }
      if (red && green && JSON.stringify(red.command) !== JSON.stringify(green.command)) {
        missing.push(`task ${task.id} red and green evidence must use the same command`);
      }
    }
    // Final evidence must postdate every task's green evidence. TDD green runs
    // are pinned to the current fingerprint (a stale one is already reported
    // above); standard tasks pin green at completion time, so their latest
    // green run is checked regardless of fingerprint.
    for (const task of inspection.taskRecords.filter((record) => record.status !== 'waived')) {
      const green = latestEvidence(
        evidenceRecords,
        changeId,
        task.id,
        'green',
        task.execution === 'tdd' ? fingerprint : undefined,
      );
      if (green && latestFinal && green.completed_at > latestFinal.completed_at) {
        missing.push(`final evidence must be recorded after task ${task.id} green evidence`);
      }
    }

    if (missing.length > 0) {
      return {
        changeId,
        status: 'blocked',
        missing: [...new Set(missing)],
        warnings,
        knowledgeCandidates,
      };
    }
    if (!options.apply) {
      return { changeId, status: 'ready', missing: [], warnings, knowledgeCandidates };
    }

    await this.store.closeChange(changeId, {
      review: review?.status === 'pass_with_warnings' ? 'passed with warnings' : 'passed',
      finalEvidence: latestFinal
        ? `${latestFinal.record_path} (matches the closing worktree fingerprint)`
        : undefined,
      knowledgeCandidates,
    });
    const session = await this.memory.readSession();
    if (session?.active_change === changeId) {
      await this.memory.clearSession();
    }
    return { changeId, status: 'closed', missing: [], warnings, knowledgeCandidates };
  }
}
