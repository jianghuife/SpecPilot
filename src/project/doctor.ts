import path from 'node:path';
import { CodeGraphAdapter } from '../graph/graph-provider.js';
import { type EvidenceRecord, EvidenceRunner } from '../evidence/evidence-runner.js';
import { inspectRuntime } from '../runtime/runtime-projector.js';
import { SPEC_PILOT_VERSION } from '../types.js';
import { readProjectConfig } from './config.js';
import { projectStatus } from './status.js';

export interface DoctorCheck {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface DoctorReport {
  root: string;
  healthy: boolean;
  checks: DoctorCheck[];
}

export async function doctorProject(root: string): Promise<DoctorReport> {
  const resolved = path.resolve(root);
  const checks: DoctorCheck[] = [];
  let config;
  try {
    config = await readProjectConfig(resolved);
    checks.push({
      name: 'config',
      status: config.managed_version === SPEC_PILOT_VERSION ? 'pass' : 'warn',
      detail:
        config.managed_version === SPEC_PILOT_VERSION
          ? `SpecPilot ${SPEC_PILOT_VERSION}`
          : `runtime ${config.managed_version}; CLI ${SPEC_PILOT_VERSION}`,
    });
  } catch (error) {
    checks.push({ name: 'config', status: 'fail', detail: (error as Error).message });
  }

  const runtime = await inspectRuntime(resolved);
  checks.push({
    name: 'runtime',
    status: runtime.healthy ? 'pass' : 'fail',
    detail: runtime.healthy ? 'managed runtime matches its manifest' : runtime.drift.join('; '),
  });

  try {
    const status = await projectStatus(resolved);
    const invalid = status.openChanges.filter((change) => change.error);
    checks.push({
      name: 'artifacts',
      status: invalid.length === 0 ? 'pass' : 'fail',
      detail:
        invalid.length === 0
          ? `${status.openChanges.length} open change(s)`
          : invalid.map((change) => `${change.id}: ${change.error}`).join('; '),
    });
  } catch (error) {
    checks.push({ name: 'artifacts', status: 'fail', detail: (error as Error).message });
  }

  const runner = new EvidenceRunner(resolved);
  const { fingerprint } = await runner.fingerprint();
  const records = await runner.list();
  const invalidEvidence = records.filter(
    (record: EvidenceRecord) =>
      record.valid !== true || record.worktree_fingerprint !== fingerprint,
  );
  checks.push({
    name: 'evidence',
    status: invalidEvidence.length === 0 ? 'pass' : 'warn',
    detail: `${records.length - invalidEvidence.length} current, ${invalidEvidence.length} invalid or stale`,
  });

  if (config?.graph.provider === 'codegraph') {
    const graph = await new CodeGraphAdapter(resolved).readiness();
    checks.push({
      name: 'codegraph',
      status: graph.available && graph.indexed && !graph.stale ? 'pass' : 'warn',
      detail:
        graph.error ?? (graph.indexed ? (graph.stale ? 'index is stale' : 'ready') : 'not indexed'),
    });
  } else {
    checks.push({
      name: 'codegraph',
      status: 'warn',
      detail: 'disabled; source search fallback is active',
    });
  }

  return {
    root: resolved,
    healthy: checks.every((check) => check.status !== 'fail'),
    checks,
  };
}
