import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initializeProject } from '../../src/project/initialize.js';
import { inspectRuntime, uninstallRuntime } from '../../src/runtime/runtime-projector.js';

describe('runtime lifecycle', () => {
  it('refuses optional Skills outside the bundled catalog before writing runtime files', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-runtime-unknown-skill-'));

    await expect(
      initializeProject({
        projectPath: root,
        hosts: ['codex'],
        graph: 'none',
        optionalSkills: ['missing-skill'],
      }),
    ).rejects.toThrow('optional Skill is not bundled: missing-skill');
    await expect(readFile(path.join(root, '.specpilot', 'config.json'))).rejects.toThrow();
  });

  it('projects selected bundled skills and removes them on uninstall', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-runtime-optional-skills-'));
    await initializeProject({
      projectPath: root,
      hosts: ['claude', 'codex'],
      graph: 'none',
      optionalSkills: ['codebase-design', 'design-principles', 'domain-modeling'],
    });

    for (const hostRoot of ['.agents', '.claude', '.codex']) {
      expect(
        await readFile(path.join(root, hostRoot, 'skills', 'codebase-design', 'SKILL.md'), 'utf8'),
      ).toContain('Design **deep modules**');
      expect(
        await readFile(path.join(root, hostRoot, 'skills', 'domain-modeling', 'SKILL.md'), 'utf8'),
      ).toContain('specs/project/glossary.md');
      expect(
        await readFile(
          path.join(root, hostRoot, 'skills', 'design-principles', 'SKILL.md'),
          'utf8',
        ),
      ).toContain('Correctness > Understandability > Change locality');
    }
    await expect(inspectRuntime(root)).resolves.toMatchObject({ healthy: true, drift: [] });

    await uninstallRuntime(root);
    for (const skill of ['codebase-design', 'design-principles', 'domain-modeling']) {
      await expect(
        readFile(path.join(root, '.agents', 'skills', skill, 'SKILL.md')),
      ).rejects.toThrow();
    }
  });

  it('preserves a selected Skill when any bundled file was modified', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-runtime-optional-drift-'));
    await initializeProject({
      projectPath: root,
      hosts: ['codex'],
      graph: 'none',
      optionalSkills: ['codebase-design'],
    });
    const reference = path.join(root, '.agents', 'skills', 'codebase-design', 'DEEPENING.md');
    await writeFile(reference, '# Local deepening guidance\n');

    const result = await uninstallRuntime(root);

    expect(result.skipped).toContain('.agents/skills/codebase-design: content changed');
    expect(await readFile(reference, 'utf8')).toContain('Local deepening guidance');
  });

  it('optionally projects and uninstalls lightweight Claude and Codex prompt hooks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-runtime-hooks-'));
    await initializeProject({
      projectPath: root,
      hosts: ['claude', 'codex'],
      graph: 'none',
      perTurnState: true,
    });

    for (const relativePath of ['.claude/settings.local.json', '.codex/hooks.json']) {
      expect(await readFile(path.join(root, relativePath), 'utf8')).toContain(
        'specpilot internal prompt-context',
      );
    }
    await expect(inspectRuntime(root)).resolves.toMatchObject({ healthy: true, drift: [] });

    await initializeProject({
      projectPath: root,
      hosts: ['claude', 'codex'],
      graph: 'none',
    });
    expect(await readFile(path.join(root, '.codex', 'hooks.json'), 'utf8')).toContain(
      'specpilot internal prompt-context',
    );

    await initializeProject({
      projectPath: root,
      hosts: ['claude', 'codex'],
      graph: 'none',
      perTurnState: false,
    });
    await expect(readFile(path.join(root, '.claude', 'settings.local.json'))).rejects.toThrow();
    await expect(readFile(path.join(root, '.codex', 'hooks.json'))).rejects.toThrow();

    await initializeProject({
      projectPath: root,
      hosts: ['claude', 'codex'],
      graph: 'none',
      perTurnState: true,
    });
    await uninstallRuntime(root);
    await expect(readFile(path.join(root, '.claude', 'settings.local.json'))).rejects.toThrow();
    await expect(readFile(path.join(root, '.codex', 'hooks.json'))).rejects.toThrow();
  });

  it('merges the prompt hook into an existing settings file and removes only its own entry', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-runtime-merge-'));
    const settingsPath = path.join(root, '.claude', 'settings.local.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(
      settingsPath,
      JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] } }, null, 2),
    );

    await initializeProject({
      projectPath: root,
      hosts: ['claude'],
      graph: 'none',
      perTurnState: true,
    });
    const merged = JSON.parse(await readFile(settingsPath, 'utf8'));
    expect(merged.permissions).toEqual({ allow: ['Bash(ls:*)'] });
    expect(JSON.stringify(merged.hooks)).toContain('specpilot internal prompt-context');
    await expect(inspectRuntime(root)).resolves.toMatchObject({ healthy: true, drift: [] });

    // The host rewriting its own settings (e.g. recording a permission
    // approval) must not block later SpecPilot runs.
    merged.permissions.allow.push('Bash(cat:*)');
    await writeFile(settingsPath, JSON.stringify(merged, null, 2));
    await initializeProject({
      projectPath: root,
      hosts: ['claude'],
      graph: 'none',
      perTurnState: true,
    });
    await expect(inspectRuntime(root)).resolves.toMatchObject({ healthy: true });

    await initializeProject({
      projectPath: root,
      hosts: ['claude'],
      graph: 'none',
      perTurnState: false,
    });
    const pruned = JSON.parse(await readFile(settingsPath, 'utf8'));
    expect(pruned.permissions.allow).toContain('Bash(cat:*)');
    expect(JSON.stringify(pruned)).not.toContain('specpilot internal prompt-context');
  });

  it('refuses to enable injection into an unparseable hooks file', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-runtime-broken-'));
    const settingsPath = path.join(root, '.claude', 'settings.local.json');
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, 'not json');

    await expect(
      initializeProject({
        projectPath: root,
        hosts: ['claude'],
        graph: 'none',
        perTurnState: true,
      }),
    ).rejects.toThrow('refusing to modify unparseable hooks file: .claude/settings.local.json');
  });

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
