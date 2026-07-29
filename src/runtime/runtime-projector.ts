import { cp, lstat, mkdir, readdir, readFile, readlink, rm, symlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Host } from '../types.js';
import { normalizeOptionalSkills } from '../project/config.js';
import { readJsonObjectFile, toPosixPath, writeJsonAtomic } from '../utils/files.js';
import { isSpecPilotId } from '../utils/identifiers.js';
import { isJsonObject } from '../utils/json.js';
import {
  containsPromptContextHook,
  removePromptContextHook,
  withPromptContextHook,
} from './hook-merge.js';

const HOST_LAYOUT: Record<Host, { skillsRoot: string; hookSource: string; hookTarget: string }> = {
  claude: {
    skillsRoot: '.claude',
    hookSource: 'claude-settings.local.json',
    hookTarget: '.claude/settings.local.json',
  },
  codex: {
    skillsRoot: '.codex',
    hookSource: 'codex-hooks.json',
    hookTarget: '.codex/hooks.json',
  },
};

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
  kind: 'directory' | 'symlink' | 'file' | 'hooks';
  hash?: string;
  hashMode?: 'skill' | 'tree';
  target?: string;
}

interface RuntimeSkill {
  name: string;
  source: string;
  hashMode: 'skill' | 'tree';
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

function bundledOptionalSkillsRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/optional_skills');
}

export async function listBundledOptionalSkills(): Promise<string[]> {
  const entries = await readdir(bundledOptionalSkillsRoot(), { withFileTypes: true });
  const available = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && isSpecPilotId(entry.name))
      .map(async (entry) => ({
        name: entry.name,
        valid: await pathExists(path.join(bundledOptionalSkillsRoot(), entry.name, 'SKILL.md')),
      })),
  );
  return available
    .filter((entry) => entry.valid)
    .map((entry) => entry.name)
    .sort();
}

function canonicalSkillPath(projectPath: string, skill: string): string {
  return path.join(projectPath, '.agents', 'skills', skill);
}

function hostSkillPath(projectPath: string, host: Host, skill: string): string {
  return path.join(projectPath, HOST_LAYOUT[host].skillsRoot, 'skills', skill);
}

function hookSourcePath(host: Host): string {
  return path.join(bundledRuntimeRoot(), 'hooks', HOST_LAYOUT[host].hookSource);
}

function hostHookPath(projectPath: string, host: Host): string {
  return path.join(projectPath, HOST_LAYOUT[host].hookTarget);
}

async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

async function hashDirectoryTree(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (current: string, relative: string): Promise<void> => {
    const entries = (await readdir(current, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        hash.update(`directory:${relativePath}\0`);
        await visit(entryPath, relativePath);
      } else if (entry.isFile()) {
        hash.update(`file:${relativePath}\0`);
        hash.update(await readFile(entryPath));
      } else if (entry.isSymbolicLink()) {
        hash.update(`symlink:${relativePath}\0${await readlink(entryPath)}\0`);
      } else {
        throw new Error(`unsupported Skill asset: ${entryPath}`);
      }
    }
  };
  await visit(directory, '');
  return hash.digest('hex');
}

async function hashSkillDirectory(
  directory: string,
  mode: 'skill' | 'tree' = 'skill',
): Promise<string> {
  return mode === 'tree'
    ? hashDirectoryTree(directory)
    : hashFile(path.join(directory, 'SKILL.md'));
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
  if (entry.kind === 'hooks') {
    try {
      const settings = await readJsonObjectFile(entryPath);
      return settings && containsPromptContextHook(settings)
        ? undefined
        : `${entry.path}: prompt-context hook entry removed`;
    } catch {
      return `${entry.path}: unreadable managed file`;
    }
  }
  if (entry.kind === 'symlink') {
    try {
      const target = await readlink(entryPath);
      return target === entry.target ? undefined : `${entry.path}: symlink target changed`;
    } catch {
      return `${entry.path}: expected symlink`;
    }
  }
  if (entry.kind === 'file') {
    try {
      return (await hashFile(entryPath)) === entry.hash
        ? undefined
        : `${entry.path}: content changed`;
    } catch {
      return `${entry.path}: unreadable managed file`;
    }
  }
  try {
    const hash = await hashSkillDirectory(entryPath, entry.hashMode);
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

export interface RuntimeProjectorOptions {
  perTurnState?: boolean;
  optionalSkills?: string[];
}

export class RuntimeProjector {
  readonly projectPath: string;
  readonly hosts: Host[];
  readonly perTurnState: boolean;
  readonly optionalSkills: string[];

  constructor(projectPath: string, hosts: Host[], options: RuntimeProjectorOptions = {}) {
    this.projectPath = path.resolve(projectPath);
    this.hosts = [...new Set(hosts)];
    this.perTurnState = options.perTurnState === true;
    this.optionalSkills = normalizeOptionalSkills(options.optionalSkills ?? []);
    for (const skill of this.optionalSkills) {
      if (!isSpecPilotId(skill)) {
        throw new Error(`invalid optional Skill name: ${skill}`);
      }
    }
  }

  private skills(): RuntimeSkill[] {
    return [
      ...WORKFLOW_SKILLS.map((name) => ({
        name,
        source: path.join(bundledRuntimeRoot(), 'skills', name),
        hashMode: 'skill' as const,
      })),
      ...this.optionalSkills.map((name) => ({
        name,
        source: path.join(bundledOptionalSkillsRoot(), name),
        hashMode: 'tree' as const,
      })),
    ];
  }

  plan(): string[] {
    const paths: string[] = [];
    for (const skill of this.skills()) {
      paths.push(
        toPosixPath(
          path.relative(
            this.projectPath,
            path.join(canonicalSkillPath(this.projectPath, skill.name), 'SKILL.md'),
          ),
        ),
      );
      for (const host of this.hosts) {
        paths.push(
          toPosixPath(
            path.relative(this.projectPath, hostSkillPath(this.projectPath, host, skill.name)),
          ),
        );
      }
    }
    paths.push(...this.hookPaths());
    paths.push('.specpilot/runtime-manifest.json');
    return paths;
  }

  async assertSafe(): Promise<void> {
    const availableOptionalSkills = await listBundledOptionalSkills();
    for (const skill of this.optionalSkills) {
      if (!availableOptionalSkills.includes(skill)) {
        throw new Error(`optional Skill is not bundled: ${skill}`);
      }
    }
    const manifest = await readManifest(this.projectPath);
    const managedPaths = new Set(manifest?.entries.map((entry) => entry.path) ?? []);
    for (const skill of this.skills()) {
      const sourceHash = await hashSkillDirectory(skill.source, skill.hashMode);
      const canonical = canonicalSkillPath(this.projectPath, skill.name);
      const canonicalRelative = toPosixPath(path.relative(this.projectPath, canonical));
      if ((await pathExists(canonical)) && !managedPaths.has(canonicalRelative)) {
        let matches: boolean;
        try {
          matches = (await hashSkillDirectory(canonical, skill.hashMode)) === sourceHash;
        } catch {
          matches = false;
        }
        if (!matches) {
          throw new Error(`refusing to overwrite unmanaged runtime path: ${canonicalRelative}`);
        }
      }
      for (const host of this.hosts) {
        const destination = hostSkillPath(this.projectPath, host, skill.name);
        const relative = toPosixPath(path.relative(this.projectPath, destination));
        if (!(await pathExists(destination)) || managedPaths.has(relative)) continue;
        let matches: boolean;
        try {
          const target = await readlink(destination);
          matches = path.resolve(path.dirname(destination), target) === canonical;
        } catch {
          try {
            matches = (await hashSkillDirectory(destination, skill.hashMode)) === sourceHash;
          } catch {
            matches = false;
          }
        }
        if (!matches) {
          throw new Error(`refusing to overwrite unmanaged runtime path: ${relative}`);
        }
      }
    }
    if (this.perTurnState) {
      // The prompt-context hook is merged into the host hooks file, so other
      // content there stays untouched; the only unsafe case is a file we
      // cannot parse and therefore cannot merge into.
      for (const host of this.hosts) {
        const destination = hostHookPath(this.projectPath, host);
        const relative = toPosixPath(path.relative(this.projectPath, destination));
        try {
          await readJsonObjectFile(destination);
        } catch {
          throw new Error(`refusing to modify unparseable hooks file: ${relative}`);
        }
      }
    }
  }

  private hookPaths(): string[] {
    if (!this.perTurnState) return [];
    return this.hosts.map((host) =>
      toPosixPath(path.relative(this.projectPath, hostHookPath(this.projectPath, host))),
    );
  }

  async apply(managedVersion: string): Promise<RuntimeManifest> {
    await this.assertSafe();
    const previous = await readManifest(this.projectPath);
    const desiredPaths = new Set<string>();
    for (const skill of this.skills()) {
      desiredPaths.add(
        toPosixPath(
          path.relative(this.projectPath, canonicalSkillPath(this.projectPath, skill.name)),
        ),
      );
      for (const host of this.hosts) {
        desiredPaths.add(
          toPosixPath(
            path.relative(this.projectPath, hostSkillPath(this.projectPath, host, skill.name)),
          ),
        );
      }
    }
    for (const relative of this.hookPaths()) {
      desiredPaths.add(relative);
    }
    // Decide up front which stale entries are removable, so nothing is
    // mutated when a modified managed path forces a refusal.
    const removable: ManagedRuntimeEntry[] = [];
    for (const entry of previous?.entries ?? []) {
      if (desiredPaths.has(entry.path)) continue;
      if (entry.kind === 'hooks') {
        // Removing only the merged prompt-context hook entry is always safe.
        removable.push(entry);
        continue;
      }
      const drift = await entryDrift(this.projectPath, entry);
      if (drift && !drift.endsWith(': missing')) {
        throw new Error(`refusing to remove modified managed runtime path: ${entry.path}`);
      }
      if (!drift) removable.push(entry);
    }

    const entries: ManagedRuntimeEntry[] = [];
    for (const skill of this.skills()) {
      const canonical = canonicalSkillPath(this.projectPath, skill.name);
      await rm(canonical, { recursive: true, force: true });
      await mkdir(path.dirname(canonical), { recursive: true });
      await cp(skill.source, canonical, { recursive: true, force: true });
      entries.push({
        path: toPosixPath(path.relative(this.projectPath, canonical)),
        kind: 'directory',
        hash: await hashSkillDirectory(canonical, skill.hashMode),
        hashMode: skill.hashMode === 'tree' ? 'tree' : undefined,
      });

      for (const host of this.hosts) {
        const destination = hostSkillPath(this.projectPath, host, skill.name);
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
          hash: target ? undefined : await hashSkillDirectory(destination, skill.hashMode),
          hashMode: !target && skill.hashMode === 'tree' ? 'tree' : undefined,
        });
      }
    }
    if (this.perTurnState) {
      for (const host of this.hosts) {
        const source = await readJsonObjectFile(hookSourcePath(host));
        const sourceHooks = source?.hooks;
        if (!isJsonObject(sourceHooks)) {
          throw new Error(`bundled hook definition is invalid: ${hookSourcePath(host)}`);
        }
        const destination = hostHookPath(this.projectPath, host);
        await mkdir(path.dirname(destination), { recursive: true });
        const existing = (await readJsonObjectFile(destination)) ?? {};
        await writeJsonAtomic(destination, withPromptContextHook(existing, sourceHooks));
        entries.push({
          path: toPosixPath(path.relative(this.projectPath, destination)),
          kind: 'hooks',
        });
      }
    }
    for (const entry of removable) {
      const target = resolveManagedPath(this.projectPath, entry.path);
      if (entry.kind === 'hooks') {
        await removePromptContextHook(target);
        continue;
      }
      await rm(target, { recursive: true, force: true });
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
    if (entry.kind === 'hooks') {
      const result = await removePromptContextHook(resolveManagedPath(root, entry.path));
      if (result === 'unreadable') skipped.push(`${entry.path}: unreadable hooks file`);
      else if (result === 'removed') removed.push(entry.path);
      continue;
    }
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
