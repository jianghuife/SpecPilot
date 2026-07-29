import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EvidenceRunner } from '../../src/evidence/evidence-runner.js';

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
});
