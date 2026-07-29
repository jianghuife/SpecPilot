import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { EvidenceRunner } from '../../src/evidence/evidence-runner.js';
import { WorkflowHarness } from '../../src/workflow/workflow-harness.js';

const execFileAsync = promisify(execFile);

describe('WorkflowHarness finish gate', () => {
  it('requires current red, green, final and a non-blocking review before closing a TDD change', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-workflow-'));
    await execFileAsync('git', ['init'], { cwd: root });
    await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
    await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root });
    await writeFile(path.join(root, 'app.ts'), 'export const value = 1;\n');
    await execFileAsync('git', ['add', 'app.ts'], { cwd: root });
    await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: root });

    const changeDirectory = path.join(root, 'specs', 'changes', 'add-value');
    await mkdir(path.join(changeDirectory, 'tasks'), { recursive: true });
    await writeFile(
      path.join(changeDirectory, 'change.yaml'),
      YAML.stringify({
        schema_version: 1,
        id: 'add-value',
        title: 'Add value',
        kind: 'light',
        status: 'open',
        created_at: '2026-07-29T00:00:00.000Z',
        spec_approved_at: '2026-07-29T00:01:00.000Z',
      }),
    );
    await writeFile(path.join(changeDirectory, 'spec.md'), '# Add value\n');
    await writeFile(
      path.join(changeDirectory, 'tasks', 'implement.md'),
      `---
schema_version: 1
id: implement
title: Implement the value
status: done
blocked_by: []
execution: tdd
---
# Implement
`,
    );
    await writeFile(
      path.join(changeDirectory, 'review.md'),
      `---
schema_version: 1
status: pass_with_warnings
standards: pass
spec: pass_with_warnings
reviewed_at: 2026-07-29T00:02:00.000Z
---
# Review
`,
    );

    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'green',
      command: [process.execPath, '-e', 'process.exit(0)'],
    });
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: [process.execPath, '-e', 'process.exit(0)'],
    });

    const harness = new WorkflowHarness(root);
    const blocked = await harness.finish('add-value');
    expect(blocked.status).toBe('blocked');
    expect(blocked.missing).toContain('task implement is missing fresh red evidence');

    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'red',
      reason: 'The focused behavior is not implemented yet.',
      command: [process.execPath, '-e', 'process.exit(1)'],
    });
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'green',
      command: [process.execPath, '-e', 'process.exit(0)'],
    });
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: [process.execPath, '-e', 'process.exit(0)'],
    });
    const closed = await harness.finish('add-value', { apply: true });
    expect(closed.status).toBe('closed');
    expect(closed.missing).toEqual([]);

    const change = YAML.parse(await readFile(path.join(changeDirectory, 'change.yaml'), 'utf8'));
    expect(change.status).toBe('closed');
    expect(change).not.toHaveProperty('phase');
    expect(await readFile(path.join(changeDirectory, 'summary.md'), 'utf8')).toContain(
      '# Change Summary',
    );
  });
});
