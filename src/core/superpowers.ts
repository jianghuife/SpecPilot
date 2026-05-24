import { execSync } from 'child_process';

import { quoteShellArg } from './openspec.js';
import type { InstallScope } from './types.js';

const SKILLS_AGENT_MAP: Record<string, string> = {
  claude: 'claude-code',
  cursor: 'cursor',
  codex: 'codex',
  opencode: 'opencode',
  windsurf: 'windsurf',
  cline: 'cline',
  roocode: 'roo',
  continue: 'continue',
  'github-copilot': 'github-copilot',
  gemini: 'gemini-cli',
  'amazon-q': 'universal',
  qwen: 'qwen-code',
  kilocode: 'kilo',
  auggie: 'augment',
  kiro: 'kiro-cli',
  lingma: 'universal',
  junie: 'junie',
  codebuddy: 'codebuddy',
  costrict: 'universal',
  crush: 'crush',
  factory: 'droid',
  iflow: 'iflow-cli',
  pi: 'pi',
  qoder: 'qoder',
  antigravity: 'antigravity',
  bob: 'bob',
  forgecode: 'forgecode',
  trae: 'trae',
};

const VALID_PLATFORM_IDS = new Set(Object.keys(SKILLS_AGENT_MAP));
const SUPERPOWERS_INSTALL_TIMEOUT_MS = 300_000;

function buildSuperpowersInstallCommand(
  _projectPath: string,
  scope: InstallScope,
  platformIds: string[],
  platform: NodeJS.Platform = process.platform,
): string {
  const unknownIds = platformIds.filter((id) => !VALID_PLATFORM_IDS.has(id));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown platform IDs: ${unknownIds.join(', ')}`);
  }

  const agentNames = [...new Set(platformIds.map((id) => SKILLS_AGENT_MAP[id]).filter(Boolean))];

  if (agentNames.length === 0) {
    throw new Error(`No valid agent names resolved for platforms: ${platformIds.join(', ')}`);
  }

  const agentFlags = agentNames.map((name) => `--agent ${quoteShellArg(name, platform)}`).join(' ');
  const flags = ['-y', scope === 'global' ? '-g' : '', agentFlags].filter(Boolean).join(' ');
  return `npx skills add obra/superpowers ${flags}`;
}

async function installSuperpowersForPlatforms(
  projectPath: string,
  scope: InstallScope,
  platformIds: string[],
): Promise<'installed' | 'failed' | 'skipped'> {
  const command = buildSuperpowersInstallCommand(projectPath, scope, platformIds);

  try {
    execSync(command, {
      cwd: projectPath,
      stdio: 'pipe',
      timeout: SUPERPOWERS_INSTALL_TIMEOUT_MS,
    });
    return 'installed';
  } catch (error) {
    console.error(`    Superpowers install failed: ${(error as Error).message}`);
    return 'failed';
  }
}

export { installSuperpowersForPlatforms, buildSuperpowersInstallCommand, SKILLS_AGENT_MAP };
