import { execFileSync } from 'child_process';

import { printCommandErrorDetails } from './command-error.js';
import { SKILLS_AGENT_MAP } from './superpowers.js';
import type { InstallScope } from './types.js';

const UNDERSTAND_ANYTHING_PACKAGE = 'Lum1104/Understand-Anything';
const UNDERSTAND_ANYTHING_INSTALL_TIMEOUT_MS = 300_000;

function getNpxExecutable(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'npx.cmd' : 'npx';
}

function buildUnderstandAnythingInstallCommand(
  scope: InstallScope,
  platformIds: string[],
): { command: string; args: string[] } {
  const unknownIds = platformIds.filter((id) => !(id in SKILLS_AGENT_MAP));
  if (unknownIds.length > 0) {
    throw new Error(`Unknown platform IDs: ${unknownIds.join(', ')}`);
  }

  const agentNames = [
    ...new Set(
      platformIds.map((id) => SKILLS_AGENT_MAP[id]).filter((name): name is string => Boolean(name)),
    ),
  ];
  const args = ['skills', 'add', UNDERSTAND_ANYTHING_PACKAGE, '-y', '--full-depth', '--skill', '*'];

  if (scope === 'global') {
    args.push('-g');
  }

  for (const name of agentNames) {
    args.push('--agent', name);
  }

  return { command: getNpxExecutable(), args };
}

async function installUnderstandAnythingForPlatforms(
  projectPath: string,
  scope: InstallScope,
  platformIds: string[],
): Promise<'installed' | 'failed' | 'skipped'> {
  const command = buildUnderstandAnythingInstallCommand(scope, platformIds);
  if (!command.args.includes('--agent')) {
    return 'skipped';
  }

  try {
    execFileSync(command.command, command.args, {
      cwd: projectPath,
      stdio: 'inherit',
      timeout: UNDERSTAND_ANYTHING_INSTALL_TIMEOUT_MS,
      shell: process.platform === 'win32',
    });
    return 'installed';
  } catch (error) {
    console.error(`    Understand Anything install failed: ${(error as Error).message}`);
    printCommandErrorDetails(error);
    return 'failed';
  }
}

export { buildUnderstandAnythingInstallCommand, installUnderstandAnythingForPlatforms };
