import path from 'path';
import os from 'os';

import { fileExists, readDir } from '../utils/file-system.js';
import { PLATFORMS, type Platform } from './platforms.js';

import type { InstallScope } from './types.js';

const SUPERPOWERS_SKILLS = [
  'brainstorming',
  'using-superpowers',
  'writing-plans',
  'test-driven-development',
  'subagent-driven-development',
];

function getBaseDir(scope: InstallScope, projectPath: string): string {
  return scope === 'global' ? os.homedir() : projectPath;
}

/**
 * Check if superpowers are installed via Claude Code plugin system.
 * Looks in ~/.claude/plugins/cache/{marketplace}/superpowers/{version}/skills/
 */
async function hasPluginSuperpowers(): Promise<boolean> {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const pluginsCacheDir = path.join(claudeDir, 'plugins', 'cache');

  const marketplaceEntries = await readDir(pluginsCacheDir);
  for (const marketplace of marketplaceEntries) {
    const superpowersDir = path.join(pluginsCacheDir, marketplace, 'superpowers');
    if (!(await fileExists(superpowersDir))) continue;

    const versionEntries = await readDir(superpowersDir);
    for (const version of versionEntries) {
      const skillsDir = path.join(superpowersDir, version, 'skills');
      const skills = await readDir(skillsDir);
      if (SUPERPOWERS_SKILLS.some((name) => skills.includes(name))) {
        return true;
      }
    }
  }
  return false;
}

async function hasSkillsInDir(
  baseDir: string,
  platform: Platform,
  component: 'openspec' | 'superpowers' | 'comet',
): Promise<boolean> {
  const skillsDir = path.join(baseDir, platform.skillsDir, 'skills');
  const entries = await readDir(skillsDir);

  switch (component) {
    case 'openspec':
      return entries.some((e) => e.startsWith('openspec-'));
    case 'superpowers':
      return SUPERPOWERS_SKILLS.some((name) => entries.includes(name));
    case 'comet':
      return entries.some((e) => e.startsWith('comet'));
  }
}

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

async function hasSkills(
  baseDir: string,
  platform: Platform,
  component: 'openspec' | 'superpowers' | 'comet',
  _selectedPlatforms: Platform[] = [],
): Promise<boolean> {
  if (await hasSkillsInDir(baseDir, platform, component)) return true;

  if (baseDir !== os.homedir()) {
    if (await hasSkillsInDir(os.homedir(), platform, component)) return true;
  }

  // Check Claude Code plugin cache for plugin-installed superpowers
  if (component === 'superpowers' && platform.id === 'claude') {
    if (await hasPluginSuperpowers()) return true;
  }

  return false;
}

export { detectPlatforms, hasSkills, hasSkillsInDir, hasPluginSuperpowers, getBaseDir };
export type { InstallScope };
