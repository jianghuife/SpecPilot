import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { RuntimeProjector } from '../runtime/runtime-projector.js';
import {
  SPEC_PILOT_VERSION,
  type InitializeOptions,
  type InitializeResult,
  type ProjectConfig,
} from '../types.js';
import { writeJsonAtomic, writeTextAtomic, writeTextIfMissing } from '../utils/files.js';
import { normalizeOptionalSkills, readProjectConfig } from './config.js';

const INITIAL_FILES: Record<string, string> = {
  'specs/project/glossary.md': `# Project Glossary\n\nRecord the domain language used by people and code.\n`,
  'specs/project/standards/README.md': `# Project Standards\n\nKeep codebase-specific engineering standards here.\n`,
  'specs/project/decisions/README.md': `# Architecture Decisions\n\nRecord durable decisions and their trade-offs here.\n`,
  'specs/knowledge/README.md': `# Verified Project Knowledge\n\nOnly reviewed, reusable knowledge with source evidence belongs here.\n`,
};

async function ensureLocalIgnore(projectPath: string): Promise<void> {
  const filePath = path.join(projectPath, '.specpilot', '.gitignore');
  let lines: string[] = [];
  try {
    lines = (await readFile(filePath, 'utf8')).split(/\r?\n/u);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  for (const entry of ['local/', 'cache/']) {
    if (!lines.includes(entry)) lines.push(entry);
  }
  const normalized = lines.filter((line, index, all) => line !== '' || index < all.length - 1);
  await writeTextAtomic(filePath, `${normalized.join('\n').replace(/\n+$/u, '')}\n`);
}

export async function initializeProject(options: InitializeOptions): Promise<InitializeResult> {
  const projectPath = path.resolve(options.projectPath);
  let existingConfig: ProjectConfig | undefined;
  if (options.perTurnState === undefined || options.optionalSkills === undefined) {
    try {
      existingConfig = await readProjectConfig(projectPath);
    } catch {
      existingConfig = undefined;
    }
  }
  let perTurnState = options.perTurnState;
  if (perTurnState === undefined) {
    perTurnState = existingConfig?.context.per_turn_state ?? false;
  }
  const optionalSkills = normalizeOptionalSkills(
    options.optionalSkills ?? existingConfig?.optional_skills ?? [],
  );
  const projector = new RuntimeProjector(projectPath, options.hosts, {
    perTurnState,
    optionalSkills,
  });
  const plannedPaths = [
    '.specpilot/config.json',
    '.specpilot/.gitignore',
    ...Object.keys(INITIAL_FILES),
    ...projector.plan(),
  ];

  if (options.dryRun) {
    return {
      projectPath,
      changed: false,
      plannedPaths,
      writtenPaths: [],
      warnings: [],
    };
  }

  await projector.assertSafe();
  await mkdir(path.join(projectPath, 'specs', 'changes'), { recursive: true });
  await mkdir(path.join(projectPath, '.specpilot', 'evidence'), { recursive: true });
  await mkdir(path.join(projectPath, '.specpilot', 'local'), { recursive: true });
  await mkdir(path.join(projectPath, '.specpilot', 'cache'), { recursive: true });

  const config: ProjectConfig = {
    schema_version: 1,
    managed_version: SPEC_PILOT_VERSION,
    language: 'en',
    hosts: [...new Set(options.hosts)],
    graph: {
      provider: options.graph,
      required: false,
    },
    context: {
      per_turn_state: perTurnState,
    },
    optional_skills: optionalSkills,
  };
  await writeJsonAtomic(path.join(projectPath, '.specpilot', 'config.json'), config);
  for (const [relativePath, content] of Object.entries(INITIAL_FILES)) {
    await writeTextIfMissing(path.join(projectPath, relativePath), content);
  }
  await ensureLocalIgnore(projectPath);
  await projector.apply(SPEC_PILOT_VERSION);

  return {
    projectPath,
    changed: true,
    plannedPaths,
    writtenPaths: plannedPaths,
    warnings: [],
  };
}
