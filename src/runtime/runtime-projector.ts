import { cp, lstat, mkdir, readFile, readlink, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Host } from '../types.js';
import { toPosixPath, writeJsonAtomic } from '../utils/files.js';

const WORKFLOW_SKILLS = [
  'specpilot-init-knowledge',
  'specpilot-start',
  'specpilot-work',
  'specpilot-review',
  'specpilot-finish',
  'specpilot-resume',
] as const;

interface ManagedRuntimeEntry {
  path: string;
  kind: 'directory' | 'symlink';
  hash?: string;
  target?: string;
}

export interface RuntimeInspection {
  healthy: boolean;
  managedVersion?: string;
  drift: string[];
}

export interface RuntimeUninstallResult {
  removed: string[];
  skipped: string[];
}

export interface RuntimeManifest {
  schema_version: 1;
  managed_version: string;
  entries: ManagedRuntimeEntry[];
}

function bundledRuntimeRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../runtime');
}

function canonicalSkillPath(projectPath: string, skill: string): string {
  return path.join(projectPath, '.agents', 'skills', skill);
}

function hostSkillPath(projectPath: string, host: Host, skill: string): string {
  return path.join(projectPath, host === 'claude' ? '.claude' : '.codex', 'skills', skill);
}

async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function hashSkillDirectory(directory: string): Promise<string> {
  return hashFile(path.join(directory, 'SKILL.md'));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

function manifestPath(projectPath: string): string {
  return path.join(projectPath, '.specpilot', 'runtime-manifest.json');
}

function resolveManagedPath(projectPath: string, relativePath: string): string {
  const resolved = path.resolve(projectPath, relativePath);
  if (resolved === projectPath || !resolved.startsWith(`${projectPath}${path.sep}`)) {
    throw new Error(`unsafe managed runtime path: ${relativePath}`);
  }
  return resolved;
}

async function readManifest(projectPath: string): Promise<RuntimeManifest | undefined> {
  try {
    const value = JSON.parse(await readFile(manifestPath(projectPath), 'utf8')) as RuntimeManifest;
    if (value.schema_version !== 1 || !Array.isArray(value.entries)) {
      throw new Error('runtime manifest schema is invalid');
    }
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function entryDrift(
  projectPath: string,
  entry: ManagedRuntimeEntry,
): Promise<string | undefined> {
  const entryPath = resolveManagedPath(projectPath, entry.path);
  if (!(await pathExists(entryPath))) return `${entry.path}: missing`;
  if (entry.kind === 'symlink') {
    try {
      const target = await readlink(entryPath);
      return target === entry.target ? undefined : `${entry.path}: symlink target changed`;
    } catch {
      return `${entry.path}: expected symlink`;
    }
  }
  try {
    const hash = await hashSkillDirectory(entryPath);
    return hash === entry.hash ? undefined : `${entry.path}: content changed`;
  } catch {
    return `${entry.path}: unreadable managed directory`;
  }
}

async function replaceWithRelativeSymlink(source: string, destination: string): Promise<void> {
  await mkdir(path.dirname(destination), { recursive: true });
  if (await pathExists(destination)) {
    await rm(destination, { recursive: true, force: true });
  }
  const target = path.relative(path.dirname(destination), source);
  try {
    await symlink(target, destination, 'junction');
  } catch {
    await cp(source, destination, { recursive: true, force: true });
  }
}

export class RuntimeProjector {
  readonly projectPath: string;
  readonly hosts: Host[];

  constructor(projectPath: string, hosts: Host[]) {
    this.projectPath = path.resolve(projectPath);
    this.hosts = [...new Set(hosts)];
  }

  plan(): string[] {
    const paths: string[] = [];
    for (const skill of WORKFLOW_SKILLS) {
      paths.push(
        toPosixPath(
          path.relative(
            this.projectPath,
            path.join(canonicalSkillPath(this.projectPath, skill), 'SKILL.md'),
          ),
        ),
      );
      for (const host of this.hosts) {
        paths.push(
          toPosixPath(
            path.relative(this.projectPath, hostSkillPath(this.projectPath, host, skill)),
          ),
        );
      }
    }
    paths.push('.specpilot/runtime-manifest.json');
    return paths;
  }

  async assertSafe(): Promise<void> {
    const manifest = await readManifest(this.projectPath);
    const managedPaths = new Set(manifest?.entries.map((entry) => entry.path) ?? []);
    for (const skill of WORKFLOW_SKILLS) {
      const source = path.join(bundledRuntimeRoot(), 'skills', skill);
      const sourceHash = await hashSkillDirectory(source);
      const canonical = canonicalSkillPath(this.projectPath, skill);
      const canonicalRelative = toPosixPath(path.relative(this.projectPath, canonical));
      if ((await pathExists(canonical)) && !managedPaths.has(canonicalRelative)) {
        let matches: boolean;
        try {
          matches = (await hashSkillDirectory(canonical)) === sourceHash;
        } catch {
          matches = false;
        }
        if (!matches) {
          throw new Error(`refusing to overwrite unmanaged runtime path: ${canonicalRelative}`);
        }
      }
      for (const host of this.hosts) {
        const destination = hostSkillPath(this.projectPath, host, skill);
        const relative = toPosixPath(path.relative(this.projectPath, destination));
        if (!(await pathExists(destination)) || managedPaths.has(relative)) continue;
        let matches: boolean;
        try {
          const target = await readlink(destination);
          matches = path.resolve(path.dirname(destination), target) === canonical;
        } catch {
          try {
            matches = (await hashSkillDirectory(destination)) === sourceHash;
          } catch {
            matches = false;
          }
        }
        if (!matches) {
          throw new Error(`refusing to overwrite unmanaged runtime path: ${relative}`);
        }
      }
    }
  }

  async apply(managedVersion: string): Promise<RuntimeManifest> {
    await this.assertSafe();
    const entries: ManagedRuntimeEntry[] = [];
    for (const skill of WORKFLOW_SKILLS) {
      const source = path.join(bundledRuntimeRoot(), 'skills', skill);
      const canonical = canonicalSkillPath(this.projectPath, skill);
      await rm(canonical, { recursive: true, force: true });
      await mkdir(path.dirname(canonical), { recursive: true });
      await cp(source, canonical, { recursive: true, force: true });
      entries.push({
        path: toPosixPath(path.relative(this.projectPath, canonical)),
        kind: 'directory',
        hash: await hashSkillDirectory(canonical),
      });

      for (const host of this.hosts) {
        const destination = hostSkillPath(this.projectPath, host, skill);
        await replaceWithRelativeSymlink(canonical, destination);
        let target: string | undefined;
        try {
          target = await readlink(destination);
        } catch {
          target = undefined;
        }
        entries.push({
          path: toPosixPath(path.relative(this.projectPath, destination)),
          kind: target ? 'symlink' : 'directory',
          target,
          hash: target ? undefined : await hashSkillDirectory(destination),
        });
      }
    }

    const manifest: RuntimeManifest = {
      schema_version: 1,
      managed_version: managedVersion,
      entries,
    };
    await writeJsonAtomic(
      path.join(this.projectPath, '.specpilot', 'runtime-manifest.json'),
      manifest,
    );
    return manifest;
  }
}

export async function inspectRuntime(projectPath: string): Promise<RuntimeInspection> {
  const root = path.resolve(projectPath);
  const manifest = await readManifest(root);
  if (!manifest) {
    return { healthy: false, drift: ['.specpilot/runtime-manifest.json: missing'] };
  }
  const drift = (
    await Promise.all(manifest.entries.map((entry) => entryDrift(root, entry)))
  ).filter((item): item is string => item !== undefined);
  return {
    healthy: drift.length === 0,
    managedVersion: manifest.managed_version,
    drift,
  };
}

export async function uninstallRuntime(projectPath: string): Promise<RuntimeUninstallResult> {
  const root = path.resolve(projectPath);
  const manifest = await readManifest(root);
  const removed: string[] = [];
  const skipped: string[] = [];
  for (const entry of [...(manifest?.entries ?? [])].reverse()) {
    const drift = await entryDrift(root, entry);
    if (drift && !drift.endsWith(': missing')) {
      skipped.push(drift);
      continue;
    }
    if (!drift) {
      await rm(resolveManagedPath(root, entry.path), { recursive: true, force: true });
      removed.push(entry.path);
    }
  }
  for (const relativePath of ['.specpilot/runtime-manifest.json', '.specpilot/config.json']) {
    const filePath = path.join(root, relativePath);
    if (await pathExists(filePath)) {
      await rm(filePath, { force: true });
      removed.push(relativePath);
    }
  }
  return { removed, skipped };
}

export { WORKFLOW_SKILLS };
