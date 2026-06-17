/**
 * Canonical Skills Store + Per-Platform Symlinks
 *
 * Makes `<base>/.agents/skills/` the single source of truth for installed skills,
 * and turns every other platform's `skills/` directory into per-skill relative
 * symlinks into that canonical store. Mirrors the layout produced by the
 * Superpowers `skills` CLI (canonical `.agents/skills` + per-skill symlinks,
 * relative links, junctions on Windows, idempotent, copy-fallback).
 *
 * See docs/superpowers/specs/2026-06-17-canonical-skills-symlink-design.md
 */
import { promises as fs } from 'fs';
import path from 'path';

import { getPlatformSkillsDir, type Platform } from './platforms.js';
import type { InstallScope } from './types.js';

const CANONICAL_PARENT_DIR = '.agents';
const SKILLS_SUBDIR = 'skills';

/**
 * The single source-of-truth skills directory: `<base>/.agents/skills`.
 * `baseDir` is already scope-resolved (project root for project scope, home
 * directory for global scope).
 */
function getCanonicalSkillsDir(baseDir: string): string {
  return path.join(baseDir, CANONICAL_PARENT_DIR, SKILLS_SUBDIR);
}

/**
 * Whether a platform-relative skills dir IS the canonical store itself (i.e. the
 * platform is the "universal" owner that reads `.agents/skills` directly and needs
 * no symlinks). Antigravity in project scope is the canonical owner because its
 * `skillsDir` is `.agents`.
 */
function isCanonicalStoreSkillsDir(skillsDir: string): boolean {
  return skillsDir === CANONICAL_PARENT_DIR;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a relative symlink at `linkPath` pointing to `target`. Idempotent: an
 * already-correct symlink is a no-op; a stale symlink or a real entry at
 * `linkPath` is removed first. Uses a junction on Windows. Returns false if the
 * link could not be created (caller falls back to a real copy).
 */
async function createSkillSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const resolvedTarget = path.resolve(target);

    try {
      const stat = await fs.lstat(linkPath);
      if (stat.isSymbolicLink()) {
        const current = path.resolve(path.dirname(linkPath), await fs.readlink(linkPath));
        if (current === resolvedTarget) return true;
        await fs.rm(linkPath, { force: true });
      } else {
        await fs.rm(linkPath, { recursive: true, force: true });
      }
    } catch {
      // linkPath does not exist yet — nothing to clean up.
    }

    await fs.mkdir(path.dirname(linkPath), { recursive: true });

    if (process.platform === 'win32') {
      await fs.symlink(resolvedTarget, linkPath, 'junction');
    } else {
      const relativeTarget = path.relative(path.dirname(linkPath), target);
      await fs.symlink(relativeTarget, linkPath);
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Move a real skill directory into the canonical store. If the canonical entry
 * already exists, merge into it (canonical wins on conflicting files). Falls back
 * to copy+remove when a rename crosses filesystems.
 */
async function relocateToCanonical(entryPath: string, canonicalEntry: string): Promise<void> {
  await fs.mkdir(path.dirname(canonicalEntry), { recursive: true });

  if (!(await fileExists(canonicalEntry))) {
    try {
      await fs.rename(entryPath, canonicalEntry);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EXDEV') throw error;
      // Cross-device rename — fall through to copy + remove.
    }
  }

  await fs.cp(entryPath, canonicalEntry, { recursive: true, force: true });
  await fs.rm(entryPath, { recursive: true, force: true });
}

export interface CanonicalizeResult {
  linked: number;
  copied: number;
}

/**
 * Fold a platform's installed skills into the canonical store and replace each
 * with a symlink. Real skill dirs under `<platform>/skills/` are moved to
 * `.agents/skills/<name>` then symlinked back. Entries that are already symlinks
 * are left untouched. If a symlink cannot be created, a real copy is restored so
 * the platform still has a working skill (copy-fallback).
 *
 * No-op for the canonical owner (a platform whose skills dir IS `.agents/skills`).
 */
async function canonicalizePlatformSkills(
  baseDir: string,
  platform: Platform,
  scope: InstallScope,
): Promise<CanonicalizeResult> {
  const canonicalDir = getCanonicalSkillsDir(baseDir);
  const platformSkillsDir = path.join(
    baseDir,
    getPlatformSkillsDir(platform, scope),
    SKILLS_SUBDIR,
  );

  if (path.resolve(platformSkillsDir) === path.resolve(canonicalDir)) {
    return { linked: 0, copied: 0 };
  }
  if (!(await fileExists(platformSkillsDir))) {
    return { linked: 0, copied: 0 };
  }

  let linked = 0;
  let copied = 0;

  const entries = await fs.readdir(platformSkillsDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(platformSkillsDir, entry.name);

    // Already a symlink (e.g. produced by the Superpowers CLI) — leave it.
    if (entry.isSymbolicLink()) continue;
    // Only relocate skill directories; ignore stray files.
    if (!entry.isDirectory()) continue;

    const canonicalEntry = path.join(canonicalDir, entry.name);
    await relocateToCanonical(entryPath, canonicalEntry);

    if (await createSkillSymlink(canonicalEntry, entryPath)) {
      linked++;
    } else {
      // Symlink unsupported (e.g. restricted Windows) — keep a real copy.
      await fs.cp(canonicalEntry, entryPath, { recursive: true, force: true });
      copied++;
    }
  }

  return { linked, copied };
}

export {
  getCanonicalSkillsDir,
  isCanonicalStoreSkillsDir,
  createSkillSymlink,
  canonicalizePlatformSkills,
  CANONICAL_PARENT_DIR,
};
