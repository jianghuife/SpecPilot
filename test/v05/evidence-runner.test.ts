import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EvidenceRunner } from '../../src/evidence/evidence-runner.js';
import { ProjectStore } from '../../src/project/project-store.js';

describe('EvidenceRunner', () => {
  it('records valid red and green evidence and detects stale code fingerprints', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-evidence-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'feature.ts'), 'export const feature = false;\n');
    execFileSync('git', ['init'], { cwd: root });
    execFileSync('git', ['config', 'user.email', 'specpilot@example.com'], { cwd: root });
    execFileSync('git', ['config', 'user.name', 'SpecPilot'], { cwd: root });
    execFileSync('git', ['add', '.'], { cwd: root });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: root });
    const store = new ProjectStore(root);
    await store.createChange({ id: 'feature', title: 'Feature', kind: 'light' });
    await store.addTask('feature', { id: 'behavior', title: 'Implement behavior' });

    const runner = new EvidenceRunner(root);
    const red = await runner.run({
      changeId: 'feature',
      taskId: 'behavior',
      phase: 'red',
      command: [process.execPath, '-e', 'process.exit(1)'],
      reason: 'the behavior is not implemented',
    });
    const green = await runner.run({
      changeId: 'feature',
      taskId: 'behavior',
      phase: 'green',
      command: [process.execPath, '-e', 'process.exit(0)'],
    });

    expect(red.valid).toBe(true);
    expect(red.exit_code).toBe(1);
    expect(green.valid).toBe(true);
    expect(green.context_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(readFile(path.join(root, red.log_path), 'utf8')).resolves.toBe('');
    await expect(runner.list('feature')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: red.id, phase: 'red' }),
        expect.objectContaining({ id: green.id, phase: 'green' }),
      ]),
    );

    await writeFile(path.join(root, 'src', 'feature.ts'), 'export const feature = true;\n');
    expect(await runner.isFresh(green)).toBe(false);
  });

  it('refuses to execute when curated context exceeds the configured budget', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-context-budget-'));
    const store = new ProjectStore(root);
    await store.createChange({ id: 'large-context', title: 'Large context', kind: 'light' });
    await store.addTask('large-context', { id: 'implement', title: 'Implement' });
    await writeFile(
      path.join(root, 'specs', 'changes', 'large-context', 'spec.md'),
      `# Large context\n\n${'x'.repeat(5_000)}\n`,
    );
    await mkdir(path.join(root, '.specpilot'), { recursive: true });
    await writeFile(
      path.join(root, '.specpilot', 'config.json'),
      JSON.stringify({
        schema_version: 1,
        managed_version: 'test',
        language: 'en',
        hosts: ['codex'],
        graph: { provider: 'none', required: false },
        context: { per_turn_state: false, max_bytes: 4_096 },
        optional_skills: [],
      }),
    );

    const runner = new EvidenceRunner(root);
    await expect(
      runner.run({
        changeId: 'large-context',
        taskId: 'implement',
        phase: 'green',
        command: [process.execPath, '-e', 'process.exit(0)'],
      }),
    ).rejects.toThrow('verification context exceeds its configured byte budget');
    await expect(runner.list()).resolves.toEqual([]);
  });
});
