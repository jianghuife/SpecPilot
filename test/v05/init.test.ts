import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initializeProject } from '../../src/project/initialize.js';
import { readProjectConfig } from '../../src/project/config.js';

describe('initializeProject', () => {
  it('plans a Claude and Codex harness without writing during dry-run', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'specpilot-init-'));

    const result = await initializeProject({
      projectPath,
      hosts: ['claude', 'codex'],
      graph: 'none',
      dryRun: true,
    });

    expect(result.changed).toBe(false);
    expect(result.plannedPaths).toContain('specs/project/glossary.md');
    expect(result.plannedPaths).toContain('specs/project/architecture/boundaries.md');
    expect(result.plannedPaths).toContain('specs/project/standards/testing.md');
    expect(result.plannedPaths).toContain('specs/project/contracts/README.md');
    expect(result.plannedPaths).toContain('specs/project/domain/workflows.md');
    expect(result.plannedPaths).toContain('specs/project/ai/evals/README.md');
    expect(result.plannedPaths).toContain('specs/project/security/README.md');
    expect(result.plannedPaths).toContain('specs/knowledge/index.md');
    expect(result.plannedPaths).toContain('.agents/skills/specpilot-start/SKILL.md');
    expect(result.plannedPaths).toContain('.agents/skills/specpilot-init-knowledge/SKILL.md');
    expect(result.plannedPaths).toContain('.claude/skills/specpilot-start');
    expect(result.plannedPaths).toContain('.codex/skills/specpilot-start');
    await expect(readFile(path.join(projectPath, '.specpilot/config.json'))).rejects.toThrow();
  });

  it('preserves existing project memory and merges local/cache gitignore rules', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'specpilot-init-preserve-'));
    await mkdir(path.join(projectPath, 'specs', 'project'), { recursive: true });
    await mkdir(path.join(projectPath, '.specpilot'), { recursive: true });
    await writeFile(
      path.join(projectPath, 'specs', 'project', 'glossary.md'),
      '# Existing glossary\n',
    );
    await writeFile(path.join(projectPath, '.specpilot', '.gitignore'), 'private-note\n');

    await initializeProject({
      projectPath,
      hosts: ['codex'],
      graph: 'none',
      contextMaxBytes: 65_536,
    });
    await initializeProject({
      projectPath,
      hosts: ['codex'],
      graph: 'none',
    });

    expect(await readFile(path.join(projectPath, 'specs', 'project', 'glossary.md'), 'utf8')).toBe(
      '# Existing glossary\n',
    );
    expect(
      await readFile(path.join(projectPath, 'specs', 'knowledge', 'index.md'), 'utf8'),
    ).toContain('okf_version: "0.2"');
    expect(
      await readFile(
        path.join(projectPath, 'specs', 'project', 'architecture', 'boundaries.md'),
        'utf8',
      ),
    ).toContain('specpilot-template:architecture-boundaries');
    const ignore = await readFile(path.join(projectPath, '.specpilot', '.gitignore'), 'utf8');
    expect(ignore).toContain('private-note');
    expect(ignore.match(/^local\/$/gmu)).toHaveLength(1);
    expect(ignore.match(/^cache\/$/gmu)).toHaveLength(1);
    await expect(readProjectConfig(projectPath)).resolves.toMatchObject({
      context: { per_turn_state: false, max_bytes: 65_536 },
    });
  });

  it('refuses to overwrite a colliding unmanaged runtime skill', async () => {
    const projectPath = await mkdtemp(path.join(os.tmpdir(), 'specpilot-init-collision-'));
    const skill = path.join(projectPath, '.codex', 'skills', 'specpilot-start');
    await mkdir(skill, { recursive: true });
    await writeFile(path.join(skill, 'SKILL.md'), '# Existing user runtime\n');

    await expect(
      initializeProject({
        projectPath,
        hosts: ['codex'],
        graph: 'none',
      }),
    ).rejects.toThrow('unmanaged runtime path');
    expect(await readFile(path.join(skill, 'SKILL.md'), 'utf8')).toBe('# Existing user runtime\n');
    await expect(readFile(path.join(projectPath, '.specpilot', 'config.json'))).rejects.toThrow();
  });
});
