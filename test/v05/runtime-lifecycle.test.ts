import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initializeProject } from '../../src/project/initialize.js';
import { inspectRuntime, uninstallRuntime } from '../../src/runtime/runtime-projector.js';

describe('runtime lifecycle', () => {
  it('is idempotent and uninstall preserves artifacts and unrelated host files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-runtime-'));
    await mkdir(path.join(root, '.claude', 'skills', 'user-skill'), { recursive: true });
    await writeFile(path.join(root, '.claude', 'settings.json'), '{"user":true}\n');
    await writeFile(
      path.join(root, '.claude', 'skills', 'user-skill', 'SKILL.md'),
      '# User skill\n',
    );

    const options = {
      projectPath: root,
      hosts: ['claude', 'codex'] as const,
      graph: 'none' as const,
      dryRun: false,
    };
    await initializeProject(options);
    await writeFile(path.join(root, 'specs', 'changes', 'keep.md'), '# Keep\n');
    await initializeProject(options);
    expect(await inspectRuntime(root)).toMatchObject({ healthy: true, drift: [] });

    const result = await uninstallRuntime(root);
    expect(result.skipped).toEqual([]);
    expect(await readFile(path.join(root, '.claude', 'settings.json'), 'utf8')).toContain(
      '"user":true',
    );
    expect(
      await readFile(path.join(root, '.claude', 'skills', 'user-skill', 'SKILL.md'), 'utf8'),
    ).toContain('User skill');
    expect(await readFile(path.join(root, 'specs', 'changes', 'keep.md'), 'utf8')).toContain(
      'Keep',
    );
  });

  it('preserves a drifted managed file during uninstall', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-runtime-drift-'));
    await initializeProject({
      projectPath: root,
      hosts: ['codex'],
      graph: 'none',
    });
    const skill = path.join(root, '.codex', 'skills', 'specpilot-work');
    await rm(skill, { recursive: true, force: true });
    await mkdir(skill, { recursive: true });
    await writeFile(path.join(skill, 'SKILL.md'), '# Local replacement\n');

    const result = await uninstallRuntime(root);
    expect(result.skipped.some((item) => item.includes('specpilot-work'))).toBe(true);
    expect(await readFile(path.join(skill, 'SKILL.md'), 'utf8')).toContain('Local replacement');
  });
});
