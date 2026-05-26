import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  getAssetsDir,
  readManifest,
  getManifestSkills,
  createWorkingDirs,
  copyCometSkillsForPlatform,
} from '../../src/core/skills.js';
import type { Platform } from '../../src/core/platforms.js';

describe('skills', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `comet-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getAssetsDir', () => {
    it('returns a path ending with assets', () => {
      const assetsDir = getAssetsDir();
      expect(path.basename(assetsDir)).toBe('assets');
    });
  });

  describe('readManifest', () => {
    it('reads and parses the manifest.json', async () => {
      const manifest = await readManifest();
      expect(manifest).toHaveProperty('version');
      expect(manifest).toHaveProperty('skills');
      expect(Array.isArray(manifest.skills)).toBe(true);
      expect(manifest.skills.length).toBeGreaterThan(0);
    });
  });

  describe('getManifestSkills', () => {
    it('returns the skills array from manifest', async () => {
      const skills = await getManifestSkills();
      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBeGreaterThan(0);
      expect(skills.some((s) => s.includes('comet/SKILL.md'))).toBe(true);
    });
  });

  describe('createWorkingDirs', () => {
    it('creates superpowers spec and plan directories', async () => {
      await createWorkingDirs(tmpDir);

      const specsDir = path.join(tmpDir, 'docs', 'superpowers', 'specs');
      const plansDir = path.join(tmpDir, 'docs', 'superpowers', 'plans');

      await expect(fs.stat(specsDir)).resolves.toBeDefined();
      await expect(fs.stat(plansDir)).resolves.toBeDefined();
    });

    it('does not throw when directories already exist', async () => {
      await createWorkingDirs(tmpDir);
      await expect(createWorkingDirs(tmpDir)).resolves.not.toThrow();
    });
  });

  describe('copyCometSkillsForPlatform', () => {
    const mockPlatform: Platform = {
      id: 'claude',
      name: 'Claude Code',
      skillsDir: '.claude',
      openspecToolId: 'claude',
    };

    it('copies skill files from assets to platform skills directory', async () => {
      const result = await copyCometSkillsForPlatform(tmpDir, mockPlatform, false);
      expect(result.copied).toBeGreaterThan(0);
      expect(result.skipped).toBe(0);

      // Verify a key file was copied
      const cometSkillPath = path.join(tmpDir, '.claude', 'skills', 'comet', 'SKILL.md');
      expect(await fileExists(cometSkillPath)).toBe(true);
    });

    it('skips existing files when overwrite is false', async () => {
      // First copy
      await copyCometSkillsForPlatform(tmpDir, mockPlatform, false);
      // Second copy should skip all
      const result = await copyCometSkillsForPlatform(tmpDir, mockPlatform, false);
      expect(result.copied).toBe(0);
      expect(result.skipped).toBeGreaterThan(0);
    });

    it('overwrites existing files when overwrite is true', async () => {
      await copyCometSkillsForPlatform(tmpDir, mockPlatform, false);
      const result = await copyCometSkillsForPlatform(tmpDir, mockPlatform, true);
      expect(result.copied).toBeGreaterThan(0);
    });

    it('copies to Chinese skills directory when language is zh', async () => {
      const result = await copyCometSkillsForPlatform(tmpDir, mockPlatform, false, 'skills-zh');
      expect(result.copied).toBeGreaterThan(0);

      // Chinese SKILL.md should exist
      const zhSkillPath = path.join(tmpDir, '.claude', 'skills', 'comet', 'SKILL.md');
      expect(await fileExists(zhSkillPath)).toBe(true);
    });
  });

  describe('Chinese Comet workflow safeguards', () => {
    it('requires explicit user confirmation at full-workflow decision points', async () => {
      const zhComet = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'comet', 'SKILL.md'),
        'utf-8',
      );
      const zhDesign = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'comet-design', 'SKILL.md'),
        'utf-8',
      );
      const zhBuild = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'comet-build', 'SKILL.md'),
        'utf-8',
      );
      const zhVerify = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'comet-verify', 'SKILL.md'),
        'utf-8',
      );
      const zhHotfix = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'comet-hotfix', 'SKILL.md'),
        'utf-8',
      );
      const zhTweak = await fs.readFile(
        path.resolve('assets', 'skills-zh', 'comet-tweak', 'SKILL.md'),
        'utf-8',
      );

      expect(zhComet).toContain('决策点是阻塞点');
      expect(zhDesign).toContain('必须暂停并等待用户明确确认设计方案');
      expect(zhBuild).toContain('不得根据推荐规则自行选择 `branch` 或 `worktree`');
      expect(zhBuild).toContain('不得根据推荐规则自行选择执行方式');
      expect(zhVerify).toContain('验证不通过时必须暂停并等待用户决定修复或接受偏差');
      expect(zhVerify).toContain('必须暂停并等待用户选择分支处理方式');
      expect(zhVerify).toContain(
        '只有在用户完成选择且对应操作完成后，才允许写入 `branch_status: handled`',
      );
      expect(zhHotfix).toContain(
        '满足升级条件时必须暂停并等待用户明确确认升级为完整 `/comet` 流程',
      );
      expect(zhHotfix).toContain('不得直接进入 `/comet-design`');
      expect(zhTweak).toContain('满足升级条件时必须暂停并等待用户明确确认升级为完整 `/comet` 流程');
      expect(zhTweak).toContain('不得直接进入 `/comet-design`');
      expect(zhComet).toContain('`verify_result: fail` → 进入验证失败决策阻塞点');
      expect(zhComet).not.toContain(
        '`verify_result: fail` → `bash "$COMET_STATE" transition <name> verify-fail` 后 `/comet-build`',
      );
      expect(zhHotfix).toContain('按升级条件阻塞确认处理');
      expect(zhHotfix).not.toContain('停止 hotfix，升级为 `/comet`');
      expect(zhTweak).toContain('按升级条件阻塞确认处理');

      // HIGH: hotfix/tweak IMPORTANT blocks must acknowledge verify decision points
      expect(zhHotfix).toContain('验证阶段（comet-verify）的验证失败决策和分支处理决策');
      expect(zhTweak).toContain('验证阶段（comet-verify）的验证失败决策和分支处理决策');

      // MEDIUM: comet-design brainstorming does not write Design Doc before confirmation
      expect(zhDesign).toContain('brainstorming 阶段不写入 Design Doc 文件');

      // MEDIUM: comet-verify Spec drift requires user choice
      expect(zhVerify).toContain('必须暂停并等待用户选择处理方式');

      // MEDIUM: comet/SKILL.md build phase resume checks build_mode/isolation
      expect(zhComet).toContain('先检查 `build_mode` 和 `isolation` 是否已设置');

      // MEDIUM: comet-verify Step 1b handles mixed CRITICAL/non-CRITICAL
      expect(zhVerify).toContain('CRITICAL 失败项必须修复');
      expect(zhVerify).toContain('不允许跳过修复直接全部接受');

      // MEDIUM: hotfix IMPORTANT covers >3-tasks comet-build decision points
      expect(zhHotfix).toContain('任务超过 3 个转入 `/comet-build` 时的工作区隔离和执行方式选择');

      // LOW: comet-build "中" level requires user confirmation before brainstorming
      expect(zhBuild).toContain(
        '暂停并等待用户确认后，必须使用 Skill 工具加载 `superpowers:brainstorming`',
      );

      // LOW: comet-build 50% threshold is a hard decision point
      expect(zhBuild).toContain('必须暂停并等待用户决定是否拆分为新 change');

      // LOW: comet-verify Step 2b disambiguates design.md vs Design Doc
      expect(zhVerify).toContain('实现符合 `openspec/changes/<name>/design.md` 高层设计决策');
      expect(zhTweak).not.toContain('停止 tweak，升级为完整 `/comet`');

      // CRITICAL: build scope split must not bypass Comet state initialization
      expect(zhBuild).toContain('通过 `/comet-open` 创建独立 change');
      expect(zhBuild).not.toContain('`/opsx:new` 创建独立 change');

      // IMPORTANT: main entry and build subskill agree scope expansion is blocking
      expect(zhComet).toContain('build 阶段范围扩张需重新设计或拆分新 change');

      // IMPORTANT: accepted Spec drift edits must not loop back through dirty-worktree handling
      expect(zhVerify).toContain('选项 A 属于 verify 阶段允许产物');

      // Dependency triggers must be explicit skill invocations, not ambiguous prose.
      expect(zhBuild).toContain('必须使用 Skill 工具加载 `superpowers:using-git-worktrees`');
      expect(zhBuild).not.toContain('或使用原生 `EnterWorktree` 工具');
      expect(zhBuild).toContain('必须使用 Skill 工具加载 `superpowers:brainstorming`');
      expect(zhHotfix).toContain('立即使用 Skill 工具加载 `comet-design` skill');
      expect(zhTweak).toContain('立即使用 Skill 工具加载 `comet-design` skill');
      expect(zhVerify).toContain('用户选择 B 后，运行 `bash "$COMET_STATE" transition <change-name> verify-fail`，然后调用 `/comet-build`');
    });
  });
});

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
