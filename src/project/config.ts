import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig } from '../types.js';

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
  return value;
}
