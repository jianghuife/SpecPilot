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
  active?: { change?: string; task?: string };
  recommendedWorkflow:
    | 'specpilot-start'
    | 'specpilot-work'
    | 'specpilot-review'
    | 'specpilot-finish';
}

export async function projectStatus(root: string): Promise<ProjectStatus> {
  const resolved = path.resolve(root);
  const store = new ProjectStore(resolved);
  const harness = new WorkflowHarness(resolved);
  const openChanges: ChangeStatusSummary[] = [];
  for (const changeId of await store.listChangeIds()) {
    try {
      const inspection = await store.inspectChange(changeId);
      if (inspection.change.status === 'closed') continue;
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

  const session = await new MemoryCatalog(resolved).readSession();
  const activeChange =
    openChanges.find((change) => change.id === session?.active_change) ??
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
    active: session ? { change: session.active_change, task: session.active_task } : undefined,
    recommendedWorkflow,
  };
}
