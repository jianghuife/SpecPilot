import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig } from '../types.js';
import { DEFAULT_CONTEXT_MAX_BYTES } from '../types.js';

export function normalizeContextMaxBytes(value: unknown): number {
  const normalized = value ?? DEFAULT_CONTEXT_MAX_BYTES;
  if (
    typeof normalized !== 'number' ||
    !Number.isInteger(normalized) ||
    normalized < 4_096 ||
    normalized > 10_485_760
  ) {
    throw new Error('context.max_bytes must be an integer from 4096 through 10485760');
  }
  return normalized;
}

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
      max_bytes: normalizeContextMaxBytes(value.context?.max_bytes),
      ...(value.context?.work_bytes !== undefined
        ? { work_bytes: normalizeContextMaxBytes(value.context.work_bytes) }
        : {}),
      ...(value.context?.review_bytes !== undefined
        ? { review_bytes: normalizeContextMaxBytes(value.context.review_bytes) }
        : {}),
    },
    optional_skills: normalizeOptionalSkills(
      Array.isArray(value.optional_skills)
        ? value.optional_skills.filter((skill): skill is string => typeof skill === 'string')
        : [],
    ),
  };
}
