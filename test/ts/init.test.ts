import { describe, expect, it } from 'vitest';
import { applyBulkOverwriteChoice } from '../../src/commands/init.js';
import {
  copyCometRulesForPlatform,
  copyCometSkillsForPlatform,
  copyOptionalSkillsForPlatform,
  createWorkingDirs,
  OPTIONAL_SKILLS,
  readManifest,
} from '../../src/core/skills.js';
import { PLATFORMS } from '../../src/core/platforms.js';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

describe('init command helpers', () => {
  it('can apply a single overwrite choice to all existing components on a platform', () => {
    const plan = {
      osAction: 'install' as const,
      spAction: 'install' as const,
      cmAction: 'install' as const,
    };

    expect(applyBulkOverwriteChoice(plan, 'overwrite-all')).toEqual({
      osAction: 'overwrite',
      spAction: 'overwrite',
      cmAction: 'overwrite',
    });
    expect(applyBulkOverwriteChoice(plan, 'skip-all')).toEqual({
      osAction: 'skip',
      spAction: 'skip',
      cmAction: 'skip',
    });
  });

  it('only affects existing components when hasExisting is provided with skip-all', () => {
    const plan = {
      osAction: 'install' as const,
      spAction: 'install' as const,
      cmAction: 'install' as const,
    };
    const hasExisting = { os: true, sp: false, cm: true };

    expect(applyBulkOverwriteChoice(plan, 'skip-all', hasExisting)).toEqual({
      osAction: 'skip',
      spAction: 'install',
      cmAction: 'skip',
    });
  });

  it('only affects existing components when hasExisting is provided with overwrite-all', () => {
    const plan = {
      osAction: 'install' as const,
      spAction: 'install' as const,
      cmAction: 'install' as const,
    };
    const hasExisting = { os: false, sp: true, cm: false };

    expect(applyBulkOverwriteChoice(plan, 'overwrite-all', hasExisting)).toEqual({
      osAction: 'install',
      spAction: 'overwrite',
      cmAction: 'install',
    });
  });

  it('creates a project Comet config with context compression disabled by default', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-init-config-'));

    try {
      await createWorkingDirs(tmpDir);

      const config = await fs.readFile(path.join(tmpDir, '.comet', 'config.yaml'), 'utf-8');
      expect(config).toContain('context_compression: off');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('installs the Comet phase guard rule from the selected language', async () => {
    const englishDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-init-rules-en-'));
    const chineseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-init-rules-zh-'));
    const claudePlatform = PLATFORMS.find((platform) => platform.id === 'claude')!;

    try {
      await copyCometRulesForPlatform(englishDir, claudePlatform, true, 'project', 'skills');
      await copyCometRulesForPlatform(chineseDir, claudePlatform, true, 'project', 'skills-zh');

      const englishRule = await fs.readFile(
        path.join(englishDir, '.claude', 'rules', 'comet-phase-guard.md'),
        'utf-8',
      );
      const chineseRule = await fs.readFile(
        path.join(chineseDir, '.claude', 'rules', 'comet-phase-guard.md'),
        'utf-8',
      );

      expect(englishRule).toContain('# Comet Phase Awareness (Anti-Drift Rules)');
      expect(englishRule).toContain('When there is an active comet change');
      expect(englishRule).not.toMatch(/[\u3400-\u9fff]/u);
      expect(chineseRule).toContain('# Comet 阶段感知（防漂移规则）');
      expect(chineseRule).toContain('有活跃 comet change 时');
    } finally {
      await fs.rm(englishDir, { recursive: true, force: true });
      await fs.rm(chineseDir, { recursive: true, force: true });
    }
  });

  it('installs selected optional skills by friendly option id', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-init-optional-skills-'));
    const claudePlatform = PLATFORMS.find((platform) => platform.id === 'claude')!;

    try {
      expect(OPTIONAL_SKILLS.map((skill) => skill.id)).toEqual([
        'antd',
        'typescript',
        'react',
        'zustand',
      ]);

      const result = await copyOptionalSkillsForPlatform(
        tmpDir,
        claudePlatform,
        ['typescript', 'react'],
        false,
        'project',
      );

      expect(result).toEqual({ copied: 2, skipped: 0 });
      await expect(
        fs.readFile(
          path.join(tmpDir, '.claude', 'skills', 'typescript-advanced-types', 'SKILL.md'),
          'utf-8',
        ),
      ).resolves.toContain('name: typescript-advanced-types');
      await expect(
        fs.readFile(
          path.join(tmpDir, '.claude', 'skills', 'vercel-react-best-practices', 'SKILL.md'),
          'utf-8',
        ),
      ).resolves.toContain('name: vercel-react-best-practices');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips existing optional skills unless overwrite is enabled', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-init-optional-skip-'));
    const claudePlatform = PLATFORMS.find((platform) => platform.id === 'claude')!;
    const skillPath = path.join(tmpDir, '.claude', 'skills', 'antd', 'SKILL.md');

    try {
      await fs.mkdir(path.dirname(skillPath), { recursive: true });
      await fs.writeFile(skillPath, 'stale skill', 'utf-8');

      const skipped = await copyOptionalSkillsForPlatform(
        tmpDir,
        claudePlatform,
        ['antd'],
        false,
        'project',
      );
      expect(skipped).toEqual({ copied: 0, skipped: 1 });
      await expect(fs.readFile(skillPath, 'utf-8')).resolves.toBe('stale skill');

      const copied = await copyOptionalSkillsForPlatform(
        tmpDir,
        claudePlatform,
        ['antd'],
        true,
        'project',
      );
      expect(copied).toEqual({ copied: 1, skipped: 0 });
      await expect(fs.readFile(skillPath, 'utf-8')).resolves.toContain('name: antd');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('installs manifest-driven Pi slash commands and preserves existing settings', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-init-pi-'));
    const piPlatform = PLATFORMS.find((platform) => platform.id === 'pi')!;
    const settingsPath = path.join(tmpDir, '.pi', 'settings.json');

    try {
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify({ theme: 'light' }), 'utf-8');

      await copyCometSkillsForPlatform(tmpDir, piPlatform, false, 'skills', 'project');

      const extension = await fs.readFile(
        path.join(tmpDir, '.pi', 'extensions', 'comet-commands.ts'),
        'utf-8',
      );
      const settings = JSON.parse(await fs.readFile(settingsPath, 'utf-8'));
      const manifest = await readManifest();
      const skillNames = manifest.skills.flatMap((skillPath) => {
        const parts = skillPath.split('/');
        return parts.length === 2 && parts[1] === 'SKILL.md' ? [parts[0]] : [];
      });

      expect(extension).toContain(
        'import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";',
      );
      for (const skillName of skillNames) {
        expect(extension).toContain(`"${skillName}"`);
      }
      expect(extension).toContain('pi.registerCommand(name');
      expect(extension).toContain('`/skill:${name} ${args}`');
      expect(extension).toContain('`/skill:${name}`');
      expect(settings).toEqual({ theme: 'light', enableSkillCommands: true });
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects invalid Pi settings without writing a command extension', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-init-pi-invalid-'));
    const piPlatform = PLATFORMS.find((platform) => platform.id === 'pi')!;
    const settingsPath = path.join(tmpDir, '.pi', 'settings.json');
    const extensionPath = path.join(tmpDir, '.pi', 'extensions', 'comet-commands.ts');

    try {
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, '{ invalid', 'utf-8');

      await expect(
        copyCometSkillsForPlatform(tmpDir, piPlatform, true, 'skills', 'project'),
      ).rejects.toThrow(/invalid Pi settings/i);
      await expect(fs.readFile(settingsPath, 'utf-8')).resolves.toBe('{ invalid');
      await expect(fs.access(extensionPath)).rejects.toThrow();
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('overwrites a stale Pi command extension while preserving unrelated settings', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-init-pi-overwrite-'));
    const piPlatform = PLATFORMS.find((platform) => platform.id === 'pi')!;
    const settingsPath = path.join(tmpDir, '.pi', 'settings.json');
    const extensionPath = path.join(tmpDir, '.pi', 'extensions', 'comet-commands.ts');

    try {
      await fs.mkdir(path.dirname(extensionPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify({ theme: 'dark' }), 'utf-8');
      await fs.writeFile(extensionPath, 'stale extension', 'utf-8');

      await copyCometSkillsForPlatform(tmpDir, piPlatform, true, 'skills', 'project');

      await expect(fs.readFile(extensionPath, 'utf-8')).resolves.not.toBe('stale extension');
      await expect(fs.readFile(settingsPath, 'utf-8')).resolves.toContain('"theme": "dark"');
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
