/**
 * Init Command
 *
 * Interactive setup for Comet workflow: platform selection, scope (global/project),
 * OpenSpec + Superpowers install, and Comet skill deployment.
 */

import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { checkbox, select } from '@inquirer/prompts';
import { copyFile, fileExists, readJson, ensureDir, readDir } from '../utils/file-system.js';
import { PLATFORMS, type Platform } from './platforms.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type InstallScope = 'global' | 'project';

type InitOptions = {
  yes?: boolean;
  skipExisting?: boolean;
  overwrite?: boolean;
};

type LanguageConfig = {
  id: string;
  name: string;
  skillsDir: string;
};

type Manifest = {
  version: string;
  skills: string[];
  languages?: LanguageConfig[];
};

type InstallStatus = 'installed' | 'skipped' | 'failed';

interface PlatformResult {
  platform: Platform;
  openspec: InstallStatus;
  superpowers: InstallStatus;
  comet: InstallStatus;
}

/**
 * Resolve the path to the assets directory (shipped with the npm package).
 */
function getAssetsDir(): string {
  return path.resolve(__dirname, '..', '..', 'assets');
}

/**
 * Get the base directory for a given scope.
 * Global: home directory. Project: project directory.
 */
function getBaseDir(scope: InstallScope, projectPath: string): string {
  return scope === 'global' ? os.homedir() : projectPath;
}

/**
 * Detect which platforms have config directories in the project.
 */
async function detectPlatforms(projectPath: string): Promise<Set<string>> {
  const detected = new Set<string>();

  for (const platform of PLATFORMS) {
    if (platform.detectionPaths && platform.detectionPaths.length > 0) {
      for (const p of platform.detectionPaths) {
        if (await fileExists(path.join(projectPath, p))) {
          detected.add(platform.id);
          break;
        }
      }
    } else {
      const dirPath = path.join(projectPath, platform.skillsDir);
      if (await fileExists(dirPath)) {
        detected.add(platform.id);
      }
    }
  }

  return detected;
}

/**
 * Superpowers skill directory names (used for detection).
 */
const SUPERPOWERS_SKILLS = [
  'brainstorming',
  'using-superpowers',
  'writing-plans',
  'test-driven-development',
  'subagent-driven-development',
];

/**
 * Check if skills exist for a component pattern in a platform's skills dir.
 * Falls back to checking the global directories of user-selected platforms.
 */
async function hasSkills(
  baseDir: string,
  platform: Platform,
  component: 'openspec' | 'superpowers' | 'comet',
  selectedPlatforms: Platform[] = []
): Promise<boolean> {
  const skillsDir = path.join(baseDir, platform.skillsDir, 'skills');
  const entries = await readDir(skillsDir);

  switch (component) {
    case 'openspec':
      if (entries.some((e) => e.startsWith('openspec-'))) return true;
      break;
    case 'superpowers':
      if (SUPERPOWERS_SKILLS.some((name) => entries.includes(name))) return true;
      break;
    case 'comet':
      if (entries.some((e) => e.startsWith('comet'))) return true;
      break;
  }

  // Check global directories of user-selected platforms
  if (baseDir !== os.homedir()) {
    for (const sp of selectedPlatforms) {
      const globalSkillsDir = path.join(os.homedir(), sp.skillsDir, 'skills');
      const globalEntries = await readDir(globalSkillsDir);

      switch (component) {
        case 'openspec':
          if (globalEntries.some((e) => e.startsWith('openspec-'))) return true;
          break;
        case 'superpowers':
          if (SUPERPOWERS_SKILLS.some((name) => globalEntries.includes(name))) return true;
          break;
        case 'comet':
          if (globalEntries.some((e) => e.startsWith('comet'))) return true;
          break;
      }
    }
  }
  return false;
}

/**
 * Check if a CLI command is available on PATH.
 */
function isCommandAvailable(command: string): boolean {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
    execSync(checkCmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure OpenSpec CLI is installed, install it if missing.
 */
async function ensureOpenSpecCli(scope: InstallScope, projectPath: string): Promise<boolean> {
  if (isCommandAvailable('openspec')) {
    return true;
  }

  console.log(`    Installing OpenSpec CLI...`);
  try {
    const npmCmd = scope === 'global'
      ? 'npm install -g @fission-ai/openspec@latest'
      : 'npm install @fission-ai/openspec@latest';
    execSync(npmCmd, { cwd: projectPath, stdio: 'pipe', timeout: 120_000 });
    return isCommandAvailable('openspec');
  } catch (error) {
    console.error(`    Failed to install OpenSpec CLI: ${(error as Error).message}`);
    return false;
  }
}

/**
 * Install OpenSpec skills for multiple platforms in one call.
 */
async function installOpenSpec(
  projectPath: string,
  toolIds: string[],
  scope: InstallScope
): Promise<InstallStatus> {
  const cliReady = await ensureOpenSpecCli(scope, projectPath);
  if (!cliReady) {
    console.error(`    OpenSpec CLI not available. Install manually: npm install -g @fission-ai/openspec@latest`);
    return 'failed';
  }

  try {
    const flags = [
      '--tools', toolIds.join(','),
      scope === 'global' ? '--global' : '',
    ].filter(Boolean).join(' ');

    execSync(`openspec init ${flags}`, {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 120_000,
    });
    return 'installed';
  } catch (error) {
    console.error(`    OpenSpec init failed: ${(error as Error).message}`);
    return 'failed';
  }
}

/**
 * Map platform IDs to skills CLI agent names.
 * The skills CLI uses specific agent identifiers (e.g. "claude-code" not "claude").
 */
const SKILLS_AGENT_MAP: Record<string, string> = {
  'claude': 'claude-code',
  'cursor': 'cursor',
  'codex': 'codex',
  'opencode': 'opencode',
  'windsurf': 'windsurf',
  'cline': 'cline',
  'roocode': 'roo-code',
  'continue': 'continue',
  'github-copilot': 'github-copilot',
  'gemini': 'gemini',
  'amazon-q': 'amazon-q',
  'qwen': 'qwen',
  'kilocode': 'kilo-code',
  'auggie': 'augment',
  'kiro': 'kiro',
  'lingma': 'lingma',
  'junie': 'junie',
  'codebuddy': 'codebuddy',
  'costrict': 'costrict',
  'crush': 'crush',
  'factory': 'factory',
  'iflow': 'iflow',
  'pi': 'pi',
  'qoder': 'qoder',
  'antigravity': 'antigravity',
  'bob': 'bob',
  'forgecode': 'forge',
  'trae': 'trae',
};

/**
 * Install Superpowers skills for specific platforms only.
 * Uses --agent flag to target only the selected platforms, preventing
 * the skills CLI from auto-detecting and installing to all platforms
 * (which would create unwanted .agents/ directories).
 */
async function installSuperpowersForPlatforms(
  projectPath: string,
  scope: InstallScope,
  platformIds: string[]
): Promise<InstallStatus> {
  const agentNames = platformIds
    .map((id) => SKILLS_AGENT_MAP[id])
    .filter(Boolean);

  if (agentNames.length === 0) {
    console.error(`    No valid agent names resolved for platforms: ${platformIds.join(', ')}`);
    return 'failed';
  }

  try {
    const flags = [
      '-y',
      scope === 'global' ? '-g' : '',
      `--agent ${agentNames.join(',')}`,
    ].filter(Boolean).join(' ');

    execSync(`npx skills add obra/superpowers ${flags}`, {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: 120_000,
    });
    return 'installed';
  } catch (error) {
    console.error(`    Superpowers install failed: ${(error as Error).message}`);
    return 'failed';
  }
}

/**
 * Copy Comet skill files from assets to a platform's skills directory.
 */
async function copyCometSkillsForPlatform(
  baseDir: string,
  platform: Platform,
  overwrite: boolean,
  languageSkillsDir: string = 'skills'
): Promise<{ copied: number; skipped: number }> {
  const assetsDir = getAssetsDir();
  const manifestPath = path.join(assetsDir, 'manifest.json');

  if (!(await fileExists(manifestPath))) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest = await readJson<Manifest>(manifestPath);
  let copied = 0;
  let skippedCount = 0;

  for (const skillRelPath of manifest.skills) {
    // Script files are language-agnostic, always from default skills/
    const isScript = skillRelPath.includes('scripts/');
    const sourceDir = isScript ? 'skills' : languageSkillsDir;

    const src = path.join(assetsDir, sourceDir, skillRelPath);
    const dest = path.join(baseDir, platform.skillsDir, 'skills', skillRelPath);

    if (!overwrite && (await fileExists(dest))) {
      skippedCount++;
      continue;
    }

    await copyFile(src, dest);
    copied++;
  }

  return { copied, skipped: skippedCount };
}

/**
 * Create Superpowers working directories (project-level only).
 */
async function createWorkingDirs(projectPath: string): Promise<void> {
  const dirs = [
    path.join(projectPath, 'docs', 'superpowers', 'specs'),
    path.join(projectPath, 'docs', 'superpowers', 'plans'),
  ];

  for (const dir of dirs) {
    await ensureDir(dir);
  }
}

/**
 * Prompt user to choose overwrite strategy for an existing installation.
 */
async function promptOverwriteChoice(
  componentName: string,
  platformName: string
): Promise<'overwrite' | 'skip'> {
  const answer = await select({
    message: `${componentName} already installed on ${platformName}. What to do?`,
    choices: [
      { name: 'Overwrite', value: 'overwrite' as const },
      { name: 'Skip', value: 'skip' as const },
    ],
  });
  return answer;
}

/**
 * Interactive installation scope selection.
 */
async function selectScope(options: InitOptions): Promise<InstallScope> {
  if (options.yes) {
    return 'project';
  }

  const scope = await select({
    message: 'Install scope:',
    choices: [
      { name: 'Project (current directory)', value: 'project' as const },
      { name: 'Global (home directory)', value: 'global' as const },
    ],
  });

  return scope;
}

/**
 * Available languages for Comet skills.
 */
const LANGUAGES: LanguageConfig[] = [
  { id: 'en', name: 'English', skillsDir: 'skills' },
  { id: 'zh', name: '中文', skillsDir: 'skills-zh' },
];

/**
 * Interactive language selection for Comet skills.
 */
async function selectLanguage(options: InitOptions): Promise<LanguageConfig> {
  if (options.yes) {
    return LANGUAGES[0];
  }

  const langId = await select({
    message: 'Language for Comet skills:',
    choices: LANGUAGES.map((lang) => ({
      name: lang.name,
      value: lang.id,
    })),
  });

  return LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];
}

/**
 * Interactive platform selection.
 */
async function selectPlatforms(
  detected: Set<string>,
  options: InitOptions
): Promise<string[]> {
  const choices = PLATFORMS.map((p) => ({
    name: `${p.name}${detected.has(p.id) ? ' (detected)' : ''}`,
    value: p.id,
    checked: detected.has(p.id),
  }));

  if (options.yes) {
    const selected = [...detected];
    return selected.length > 0 ? selected : PLATFORMS.map((p) => p.id);
  }

  const selected = await checkbox({
    message: 'Select platforms to set up:',
    choices,
    required: true,
  });

  return selected;
}

/**
 * Display installation summary.
 */
function displaySummary(results: PlatformResult[], scope: InstallScope): void {
  const scopeLabel = scope === 'global' ? os.homedir() : 'project';

  console.log(`\n  Comet setup complete! (scope: ${scopeLabel})\n`);

  const installed = results.filter(
    (r) => r.openspec === 'installed' || r.superpowers === 'installed' || r.comet === 'installed'
  );
  const skipped = results.filter(
    (r) => r.openspec === 'skipped' && r.superpowers === 'skipped' && r.comet === 'skipped'
  );
  const failed = results.filter(
    (r) => r.openspec === 'failed' || r.superpowers === 'failed'
  );

  if (installed.length > 0) {
    console.log(`  Installed:`);
    for (const r of installed) {
      console.log(`    ${r.platform.name} -> ${r.platform.skillsDir}/skills/`);
    }
  }
  if (skipped.length > 0) {
    console.log(`  Skipped: ${skipped.map((r) => r.platform.name).join(', ')}`);
  }
  if (failed.length > 0) {
    console.log(`  Failed: ${failed.map((r) => r.platform.name).join(', ')}`);
  }

  if (scope === 'project') {
    console.log(`\n  Working directories: docs/superpowers/specs/, docs/superpowers/plans/`);
  }

  console.log(`\n  Get started:`);
  console.log(`    /comet "your idea"  — Start a new change with full workflow`);
  console.log(`    /comet-hotfix       — Quick bug fix (skip brainstorming)`);
  console.log(`    /comet-tweak        — Small change (skip brainstorming and plan)\n`);
}

/**
 * Resolve action for a component based on options and existing state.
 */
function resolveAction(
  hasExisting: boolean,
  options: InitOptions
): 'overwrite' | 'skip' | 'install' {
  if (!hasExisting) return 'install';
  if (options.overwrite) return 'overwrite';
  if (options.skipExisting) return 'skip';
  if (options.yes) return 'skip';
  return 'install'; // will be prompted interactively
}

/**
 * Main init command.
 */
const COMET_BANNER = [
  `   ██████╗ ██████╗ ███╗   ███╗███████╗████████╗`,
  `  ██╔════╝██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝`,
  `  ██║     ██║   ██║██╔████╔██║█████╗     ██║   `,
  `  ██║     ██║   ██║██║╚██╔╝██║██╔══╝     ██║   `,
  `  ╚██████╗╚██████╔╝██║ ╚═╝ ██║███████╗   ██║   `,
  `   ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝   `,
  `            OpenSpec + Superpowers Workflow       `,
].join('\n');

export async function initCommand(targetPath: string, options: InitOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);

  console.log(`\n${COMET_BANNER}\n`);
  console.log(`  Setting up Comet in ${projectPath}\n`);

  // Step 1: Detect available platforms
  const detected = await detectPlatforms(projectPath);

  // Step 2: Select scope (global vs project)
  const scope = await selectScope(options);

  // Step 2.5: Select language for Comet skills
  const language = await selectLanguage(options);
  console.log(`  Language: ${language.name}`);

  // Step 3: Platform selection
  const selectedPlatformIds = await selectPlatforms(detected, options);

  if (selectedPlatformIds.length === 0) {
    console.log('\n  No platforms selected. Exiting.\n');
    return;
  }

  const selectedPlatforms = PLATFORMS.filter((p) => selectedPlatformIds.includes(p.id));
  const baseDir = getBaseDir(scope, projectPath);

  // Step 4: Detect existing installations and determine actions
  type PlatformPlan = {
    platform: Platform;
    osAction: 'overwrite' | 'skip' | 'install';
    spAction: 'overwrite' | 'skip' | 'install';
    cmAction: 'overwrite' | 'skip' | 'install';
  };

  const plans: PlatformPlan[] = [];

  for (const platform of selectedPlatforms) {
    const hasOS = await hasSkills(baseDir, platform, 'openspec', selectedPlatforms);
    const hasSP = await hasSkills(baseDir, platform, 'superpowers', selectedPlatforms);
    const hasCM = await hasSkills(baseDir, platform, 'comet', selectedPlatforms);

    let osAction = resolveAction(hasOS, options);
    let spAction = resolveAction(hasSP, options);
    let cmAction = resolveAction(hasCM, options);

    // Interactive prompts for existing components
    if (!options.yes) {
      if (osAction === 'install' && hasOS) {
        osAction = await promptOverwriteChoice('OpenSpec', platform.name);
      }
      if (spAction === 'install' && hasSP) {
        spAction = await promptOverwriteChoice('Superpowers', platform.name);
      }
      if (cmAction === 'install' && hasCM) {
        cmAction = await promptOverwriteChoice('Comet', platform.name);
      }
    }

    plans.push({ platform, osAction, spAction, cmAction });
  }

  // Step 5: Install OpenSpec (one call for all platforms that need it)
  const osToolIds = plans
    .filter((p) => p.osAction !== 'skip')
    .map((p) => p.platform.openspecToolId);

  let osGlobalStatus: InstallStatus = 'skipped';
  if (osToolIds.length > 0) {
    console.log(`\n  Installing OpenSpec for: ${osToolIds.join(', ')}`);
    osGlobalStatus = await installOpenSpec(projectPath, osToolIds, scope);
    console.log(`  OpenSpec: ${osGlobalStatus}`);
  } else {
    console.log(`\n  OpenSpec: all skipped`);
  }

  // Step 6: Install Superpowers (scoped to selected platforms only)
  const spPlatformIds = plans
    .filter((p) => p.spAction !== 'skip')
    .map((p) => p.platform.id);
  let spGlobalStatus: InstallStatus = 'skipped';

  if (spPlatformIds.length > 0) {
    console.log(`\n  Installing Superpowers for: ${spPlatformIds.join(', ')}`);
    spGlobalStatus = await installSuperpowersForPlatforms(projectPath, scope, spPlatformIds);
    console.log(`  Superpowers: ${spGlobalStatus}`);
  } else {
    console.log(`\n  Superpowers: all skipped`);
  }

  // Step 7: Copy Comet skills (per-platform)
  const results: PlatformResult[] = [];

  for (const plan of plans) {
    const { platform, cmAction } = plan;
    const skillsPath = `${scope === 'global' ? '~/' : ''}${platform.skillsDir}/skills/`;

    let cmStatus: InstallStatus = 'skipped';
    if (cmAction !== 'skip') {
      const { copied } = await copyCometSkillsForPlatform(baseDir, platform, cmAction === 'overwrite', language.skillsDir);
      cmStatus = copied > 0 ? 'installed' : 'skipped';
      console.log(`  Comet -> ${platform.name}: ${cmStatus} (${copied} files) -> ${skillsPath}`);
    } else {
      console.log(`  Comet -> ${platform.name}: skipped (already exists)`);
    }

    results.push({
      platform,
      openspec: osToolIds.includes(platform.openspecToolId) ? osGlobalStatus : 'skipped',
      superpowers: plan.spAction !== 'skip' ? spGlobalStatus : 'skipped',
      comet: cmStatus,
    });
  }

  // Step 8: Create working directories (project-level only)
  if (scope === 'project') {
    await createWorkingDirs(projectPath);
  }

  // Step 9: Summary
  displaySummary(results, scope);
}
