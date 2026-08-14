import path from 'node:path';
import { MemoryCatalog } from '../memory/memory-catalog.js';
import { ProjectStore } from './project-store.js';
import { WorkflowHarness } from '../workflow/workflow-harness.js';

export interface ChangeStatusSummary {
  id: string;
  title?: string;
  kind?: 'light' | 'standard';
  tasks?: {
    total: number;
    todo: number;
    doing: number;
    done: number;
    blocked: number;
    waived: number;
    tdd: number;
  };
  gate: 'ready' | 'blocked';
  missing: string[];
  error?: string;
}

export interface ProjectStatus {
  root: string;
  openChanges: ChangeStatusSummary[];
  active?: { change?: string; task?: string; stale: boolean };
  recommendedWorkflow:
    | 'specpilot-start'
    | 'specpilot-work'
    | 'specpilot-review'
    | 'specpilot-finish';
  knowledgeCandidates: string[];
}

export async function projectStatus(root: string): Promise<ProjectStatus> {
  const resolved = path.resolve(root);
  const store = new ProjectStore(resolved);
  const harness = new WorkflowHarness(resolved);
  const openChanges: ChangeStatusSummary[] = [];
  const taskIdsByChange = new Map<string, Set<string>>();
  for (const changeId of await store.listChangeIds()) {
    try {
      const inspection = await store.inspectChange(changeId);
      if (inspection.change.status === 'closed') continue;
      taskIdsByChange.set(changeId, new Set(inspection.taskRecords.map((task) => task.id)));
      const gate = await harness.finish(changeId);
      openChanges.push({
        id: changeId,
        title: inspection.change.title,
        kind: inspection.change.kind,
        tasks: inspection.tasks,
        gate: gate.status === 'ready' ? 'ready' : 'blocked',
        missing: gate.missing,
      });
    } catch (error) {
      openChanges.push({
        id: changeId,
        gate: 'blocked',
        missing: [],
        error: (error as Error).message,
      });
    }
  }

  const memory = new MemoryCatalog(resolved);
  const session = await memory.readSession();
  const knowledgeCandidates = await memory.listKnowledgeCandidates();
  const pointedChange = openChanges.find((change) => change.id === session?.active_change);
  // Stale means the pointer references a missing or closed change/task; a
  // session without an active pointer is empty, not stale.
  const sessionStale =
    session !== undefined &&
    ((session.active_change !== undefined && !pointedChange) ||
      (session.active_task !== undefined &&
        !taskIdsByChange.get(session.active_change ?? '')?.has(session.active_task)));
  const activeChange =
    (sessionStale ? undefined : pointedChange) ??
    (openChanges.length === 1 ? openChanges[0] : undefined);
  let recommendedWorkflow: ProjectStatus['recommendedWorkflow'] = 'specpilot-start';
  if (openChanges.length > 0) {
    if (activeChange?.gate === 'ready') recommendedWorkflow = 'specpilot-finish';
    else if (
      activeChange?.tasks &&
      activeChange.tasks.todo + activeChange.tasks.doing + activeChange.tasks.blocked === 0
    ) {
      recommendedWorkflow = activeChange.missing.some((item) => item.includes('review'))
        ? 'specpilot-review'
        : 'specpilot-finish';
    } else {
      recommendedWorkflow = 'specpilot-work';
    }
  }
  return {
    root: resolved,
    openChanges,
    active: session
      ? {
          change: session.active_change,
          task: session.active_task,
          stale: sessionStale,
        }
      : undefined,
    recommendedWorkflow,
    knowledgeCandidates,
  };
}
