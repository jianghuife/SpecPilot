import path from 'path';
import os from 'os';
import { checkbox, select } from '@inquirer/prompts';
import { PLATFORMS, type Platform } from '../core/platforms.js';
import { detectPlatforms, hasSkills, getBaseDir, type InstallScope } from '../core/detect.js';
import {
  copyCometSkillsForPlatform,
  createWorkingDirs,
  type LanguageConfig,
} from '../core/skills.js';
import { installOpenSpec } from '../core/openspec.js';
import { installSuperpowersForPlatforms } from '../core/superpowers.js';

type InitOptions = {
  yes?: boolean;
  skipExisting?: boolean;
  overwrite?: boolean;
  json?: boolean;
};

type InstallStatus = 'installed' | 'skipped' | 'failed';

interface PlatformResult {
  platform: Platform;
  openspec: InstallStatus;
  superpowers: InstallStatus;
  comet: InstallStatus;
}

const LANGUAGES: LanguageConfig[] = [
  { id: 'en', name: 'English', skillsDir: 'skills' },
  { id: 'zh', name: '中文', skillsDir: 'skills-zh' },
];

const COMET_BANNER = [
  `   ██████╗ ██████╗ ███╗   ███╗███████╗████████╗`,
  `  ██╔════╝██╔═══██╗████╗ ████║██╔════╝╚══██╔══╝`,
  `  ██║     ██║   ██║██╔████╔██║█████╗     ██║   `,
  `  ██║     ██║   ██║██║╚██╔╝██║██╔══╝     ██║   `,
  `  ╚██████╗╚██████╔╝██║ ╚═╝ ██║███████╗   ██║   `,
  `   ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚══════╝   ╚═╝   `,
  `            OpenSpec + Superpowers Workflow       `,
].join('\n');

async function selectScope(options: InitOptions): Promise<InstallScope> {
  if (options.yes) return 'project';

  return select({
    message: 'Install scope:',
    choices: [
      { name: 'Project (current directory)', value: 'project' as const },
      { name: 'Global (home directory)', value: 'global' as const },
    ],
  });
}

async function selectLanguage(options: InitOptions): Promise<LanguageConfig> {
  if (options.yes) return LANGUAGES[0];

  const langId = await select({
    message: 'Language for Comet skills:',
    choices: LANGUAGES.map((lang) => ({ name: lang.name, value: lang.id })),
  });

  return LANGUAGES.find((l) => l.id === langId) ?? LANGUAGES[0];
}

async function selectPlatforms(detected: Set<string>, options: InitOptions): Promise<string[]> {
  const choices = PLATFORMS.map((p) => ({
    name: `${p.name}${detected.has(p.id) ? ' (detected)' : ''}`,
    value: p.id,
    checked: detected.has(p.id),
  }));

  if (options.yes) {
    const selected = [...detected];
    return selected.length > 0 ? selected : PLATFORMS.map((p) => p.id);
  }

  return checkbox({ message: 'Select platforms to set up:', choices, required: true });
}

async function promptOverwriteChoice(
  componentName: string,
  platformName: string,
): Promise<'overwrite' | 'skip'> {
  return select({
    message: `${componentName} already installed on ${platformName}. What to do?`,
    choices: [
      { name: 'Overwrite', value: 'overwrite' as const },
      { name: 'Skip', value: 'skip' as const },
    ],
  });
}

function resolveAction(
  hasExisting: boolean,
  options: InitOptions,
): 'overwrite' | 'skip' | 'install' {
  if (!hasExisting) return 'install';
  if (options.overwrite) return 'overwrite';
  if (options.skipExisting) return 'skip';
  if (options.yes) return 'skip';
  return 'install';
}

function displaySummary(results: PlatformResult[], scope: InstallScope): void {
  const scopeLabel = scope === 'global' ? os.homedir() : 'project';

  console.log(`\n  Comet setup complete! (scope: ${scopeLabel})\n`);

  const installed = results.filter(
    (r) => r.openspec === 'installed' || r.superpowers === 'installed' || r.comet === 'installed',
  );
  const skipped = results.filter(
    (r) => r.openspec === 'skipped' && r.superpowers === 'skipped' && r.comet === 'skipped',
  );
  const failed = results.filter(
    (r) => r.openspec === 'failed' || r.superpowers === 'failed' || r.comet === 'failed',
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

export async function initCommand(targetPath: string, options: InitOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);

  console.log(`\n${COMET_BANNER}\n`);
  console.log(`  Setting up Comet in ${projectPath}\n`);

  const detected = await detectPlatforms(projectPath);
  const scope = await selectScope(options);
  const language = await selectLanguage(options);
  console.log(`  Language: ${language.name}`);

  const selectedPlatformIds = await selectPlatforms(detected, options);
  if (selectedPlatformIds.length === 0) {
    console.log('\n  No platforms selected. Exiting.\n');
    return;
  }

  const selectedPlatforms = PLATFORMS.filter((p) => selectedPlatformIds.includes(p.id));
  const baseDir = getBaseDir(scope, projectPath);

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

  const spPlatformIds = plans.filter((p) => p.spAction !== 'skip').map((p) => p.platform.id);
  let spGlobalStatus: InstallStatus = 'skipped';

  if (spPlatformIds.length > 0) {
    console.log(`\n  Installing Superpowers for: ${spPlatformIds.join(', ')}`);
    spGlobalStatus = await installSuperpowersForPlatforms(projectPath, scope, spPlatformIds);
    console.log(`  Superpowers: ${spGlobalStatus}`);
  } else {
    console.log(`\n  Superpowers: all skipped`);
  }

  const results: PlatformResult[] = [];

  for (const plan of plans) {
    const { platform, cmAction } = plan;
    const skillsPath = `${scope === 'global' ? '~/' : ''}${platform.skillsDir}/skills/`;

    let cmStatus: InstallStatus = 'skipped';
    if (cmAction !== 'skip') {
      const { copied } = await copyCometSkillsForPlatform(
        baseDir,
        platform,
        cmAction === 'overwrite',
        language.skillsDir,
      );
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

  if (scope === 'project') {
    await createWorkingDirs(projectPath);
  }

  displaySummary(results, scope);
}
