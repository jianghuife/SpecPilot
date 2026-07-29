import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig } from '../types.js';

export async function findProjectRoot(startPath: string): Promise<string | undefined> {
  let current = path.resolve(startPath);
  while (true) {
    try {
      await readFile(path.join(current, '.specpilot', 'config.json'));
      return current;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function normalizeOptionalSkills(skills: readonly string[]): string[] {
  return [...new Set(skills)].sort();
}

export async function readProjectConfig(root: string): Promise<ProjectConfig> {
  const filePath = path.join(path.resolve(root), '.specpilot', 'config.json');
  const value = JSON.parse(await readFile(filePath, 'utf8')) as ProjectConfig;
  if (
    value.schema_version !== 1 ||
    value.language !== 'en' ||
    !Array.isArray(value.hosts) ||
    !value.graph ||
    (value.graph.provider !== 'codegraph' && value.graph.provider !== 'none')
  ) {
    throw new Error(`${filePath} is not a valid SpecPilot 0.5 config`);
  }
  return {
    ...value,
    context: {
      per_turn_state: value.context?.per_turn_state === true,
    },
    optional_skills: normalizeOptionalSkills(
      Array.isArray(value.optional_skills)
        ? value.optional_skills.filter((skill): skill is string => typeof skill === 'string')
        : [],
    ),
  };
}
