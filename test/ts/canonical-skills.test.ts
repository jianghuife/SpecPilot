import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';

import {
  getCanonicalSkillsDir,
  isCanonicalStoreSkillsDir,
  createSkillSymlink,
  canonicalizePlatformSkills,
} from '../../src/core/canonical-skills.js';
import { PLATFORMS, type Platform } from '../../src/core/platforms.js';

const codex = PLATFORMS.find((p) => p.id === 'codex') as Platform;
const antigravity = PLATFORMS.find((p) => p.id === 'antigravity') as Platform;

async function isSymlinkTo(linkPath: string, expectedTarget: string): Promise<boolean> {
  const stat = await fs.lstat(linkPath);
  if (!stat.isSymbolicLink()) return false;
  const resolved = path.resolve(path.dirname(linkPath), await fs.readlink(linkPath));
  return resolved === path.resolve(expectedTarget);
}

describe('canonical-skills', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comet-canonical-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('getCanonicalSkillsDir', () => {
    it('points at <base>/.agents/skills', () => {
      expect(getCanonicalSkillsDir(tmpDir)).toBe(path.join(tmpDir, '.agents', 'skills'));
    });
  });

  describe('isCanonicalStoreSkillsDir', () => {
    it('is true for the .agents owner and false for other platforms', () => {
      expect(isCanonicalStoreSkillsDir('.agents')).toBe(true);
      expect(isCanonicalStoreSkillsDir('.codex')).toBe(false);
    });
  });

  describe('createSkillSymlink', () => {
    it('creates a relative symlink to the target', async () => {
      const target = path.join(tmpDir, '.agents', 'skills', 'demo');
      await fs.mkdir(target, { recursive: true });
      const linkPath = path.join(tmpDir, '.codex', 'skills', 'demo');

      const ok = await createSkillSymlink(target, linkPath);

      expect(ok).toBe(true);
      expect(await isSymlinkTo(linkPath, target)).toBe(true);
      // relative, not absolute
      expect(path.isAbsolute(await fs.readlink(linkPath))).toBe(false);
    });

    it('is idempotent — re-running keeps the same correct link', async () => {
      const target = path.join(tmpDir, '.agents', 'skills', 'demo');
      await fs.mkdir(target, { recursive: true });
      const linkPath = path.join(tmpDir, '.codex', 'skills', 'demo');

      expect(await createSkillSymlink(target, linkPath)).toBe(true);
      expect(await createSkillSymlink(target, linkPath)).toBe(true);
      expect(await isSymlinkTo(linkPath, target)).toBe(true);
    });

    it('replaces a stale real directory at the link path', async () => {
      const target = path.join(tmpDir, '.agents', 'skills', 'demo');
      await fs.mkdir(target, { recursive: true });
      const linkPath = path.join(tmpDir, '.codex', 'skills', 'demo');
      await fs.mkdir(linkPath, { recursive: true });
      await fs.writeFile(path.join(linkPath, 'stale.txt'), 'old');

      expect(await createSkillSymlink(target, linkPath)).toBe(true);
      expect(await isSymlinkTo(linkPath, target)).toBe(true);
    });
  });

  describe('canonicalizePlatformSkills', () => {
    it('moves real platform skills into canonical and symlinks them back', async () => {
      const codexSkills = path.join(tmpDir, '.codex', 'skills');
      await fs.mkdir(path.join(codexSkills, 'redux-toolkit'), { recursive: true });
      await fs.writeFile(path.join(codexSkills, 'redux-toolkit', 'SKILL.md'), 'redux skill');

      const result = await canonicalizePlatformSkills(tmpDir, codex, 'project');

      expect(result.linked).toBe(1);
      const canonicalEntry = path.join(tmpDir, '.agents', 'skills', 'redux-toolkit');
      // Real file now lives in canonical
      expect(await fs.readFile(path.join(canonicalEntry, 'SKILL.md'), 'utf-8')).toBe('redux skill');
      // Platform entry is now a symlink into canonical
      expect(await isSymlinkTo(path.join(codexSkills, 'redux-toolkit'), canonicalEntry)).toBe(true);
      // Content is reachable through the symlink
      expect(
        await fs.readFile(path.join(codexSkills, 'redux-toolkit', 'SKILL.md'), 'utf-8'),
      ).toBe('redux skill');
    });

    it('is a no-op for the canonical owner (antigravity)', async () => {
      const agentsSkills = path.join(tmpDir, '.agents', 'skills');
      await fs.mkdir(path.join(agentsSkills, 'comet'), { recursive: true });
      await fs.writeFile(path.join(agentsSkills, 'comet', 'SKILL.md'), 'comet skill');

      const result = await canonicalizePlatformSkills(tmpDir, antigravity, 'project');

      expect(result).toEqual({ linked: 0, copied: 0 });
      // Untouched: still a real directory, not a symlink
      expect((await fs.lstat(path.join(agentsSkills, 'comet'))).isSymbolicLink()).toBe(false);
    });

    it('skips entries that are already symlinks (idempotent re-run)', async () => {
      const codexSkills = path.join(tmpDir, '.codex', 'skills');
      await fs.mkdir(path.join(codexSkills, 'viteplus'), { recursive: true });
      await fs.writeFile(path.join(codexSkills, 'viteplus', 'SKILL.md'), 'vite skill');

      const first = await canonicalizePlatformSkills(tmpDir, codex, 'project');
      expect(first.linked).toBe(1);

      const second = await canonicalizePlatformSkills(tmpDir, codex, 'project');
      expect(second).toEqual({ linked: 0, copied: 0 });
    });

    it('merges into an existing canonical entry', async () => {
      const canonicalEntry = path.join(tmpDir, '.agents', 'skills', 'zustand-best-practices');
      await fs.mkdir(canonicalEntry, { recursive: true });
      await fs.writeFile(path.join(canonicalEntry, 'SKILL.md'), 'canonical version');

      const codexSkills = path.join(tmpDir, '.codex', 'skills');
      await fs.mkdir(path.join(codexSkills, 'zustand-best-practices'), { recursive: true });
      await fs.writeFile(
        path.join(codexSkills, 'zustand-best-practices', 'extra.md'),
        'extra file',
      );

      const result = await canonicalizePlatformSkills(tmpDir, codex, 'project');

      expect(result.linked).toBe(1);
      // Both the pre-existing canonical file and the merged-in file are present
      expect(await fs.readFile(path.join(canonicalEntry, 'SKILL.md'), 'utf-8')).toBe(
        'canonical version',
      );
      expect(await fs.readFile(path.join(canonicalEntry, 'extra.md'), 'utf-8')).toBe('extra file');
      expect(
        await isSymlinkTo(path.join(codexSkills, 'zustand-best-practices'), canonicalEntry),
      ).toBe(true);
    });

    it('is a no-op when the platform has no skills directory', async () => {
      const result = await canonicalizePlatformSkills(tmpDir, codex, 'project');
      expect(result).toEqual({ linked: 0, copied: 0 });
    });
  });
});
