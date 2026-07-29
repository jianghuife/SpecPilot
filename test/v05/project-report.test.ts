import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { MemoryCatalog } from '../../src/memory/memory-catalog.js';
import { readProjectConfig } from '../../src/project/config.js';
import { doctorProject } from '../../src/project/doctor.js';
import { initializeProject } from '../../src/project/initialize.js';
import { projectStatus } from '../../src/project/status.js';

describe('project reports', () => {
  it('reports open work, recommendations, runtime drift, and invalid config', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-report-'));
    await initializeProject({
      projectPath: root,
      hosts: ['codex'],
      graph: 'none',
    });
    await expect(readProjectConfig(root)).resolves.toMatchObject({
      hosts: ['codex'],
      graph: { provider: 'none' },
    });

    const change = path.join(root, 'specs', 'changes', 'reporting');
    await mkdir(path.join(change, 'tasks'), { recursive: true });
    await writeFile(
      path.join(change, 'change.yaml'),
      YAML.stringify({
        schema_version: 1,
        id: 'reporting',
        title: 'Reporting',
        kind: 'light',
        status: 'open',
        created_at: '2026-07-29T00:00:00.000Z',
      }),
    );
    await writeFile(path.join(change, 'spec.md'), '# Reporting\n');
    await writeFile(
      path.join(change, 'tasks', 'report.md'),
      `---
schema_version: 1
id: report
title: Report
status: todo
blocked_by: []
execution: standard
---
# Report
`,
    );
    await new MemoryCatalog(root).writeSession({
      active_change: 'reporting',
      active_task: 'report',
    });

    const status = await projectStatus(root);
    expect(status.recommendedWorkflow).toBe('specpilot-work');
    expect(status.openChanges[0]).toMatchObject({
      id: 'reporting',
      gate: 'blocked',
      tasks: { todo: 1 },
    });

    const healthy = await doctorProject(root);
    expect(healthy.healthy).toBe(true);
    expect(healthy.checks.find((check) => check.name === 'codegraph')).toMatchObject({
      status: 'warn',
    });

    await writeFile(
      path.join(root, '.codex', 'skills', 'specpilot-start', 'SKILL.md'),
      '# User changed this managed file\n',
    );
    const drifted = await doctorProject(root);
    expect(drifted.healthy).toBe(false);
    expect(drifted.checks.find((check) => check.name === 'runtime')).toMatchObject({
      status: 'fail',
    });

    await writeFile(path.join(root, '.specpilot', 'config.json'), '{"schema_version":2}\n');
    await expect(readProjectConfig(root)).rejects.toThrow('valid SpecPilot 0.5 config');
  });
});
