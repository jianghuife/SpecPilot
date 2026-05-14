/**
 * Init Command
 *
 * Sets up Comet workflow: installs OpenSpec, Superpowers, and copies Comet skills.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { copyFile, fileExists, readJson, writeFile, ensureDir } from '../utils/file-system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type InitOptions = {
  yes?: boolean;
  skipExisting?: boolean;
  overwrite?: boolean;
};

type Manifest = {
  version: string;
  skills: string[];
};

/**
 * Resolve the path to the assets directory (shipped with the npm package).
 */
function getAssetsDir(): string {
  return path.resolve(__dirname, '..', '..', 'assets');
}

/**
 * Check if OpenSpec is installed and configured.
 */
async function isOpenSpecInstalled(projectPath: string): Promise<boolean> {
  const configPath = path.join(projectPath, 'openspec', 'config.yaml');
  const configYmlPath = path.join(projectPath, 'openspec', 'config.yml');
  const skillPath = path.join(projectPath, '.claude', 'skills', 'openspec-new-change', 'SKILL.md');
  return (await fileExists(configPath)) || (await fileExists(configYmlPath)) || (await fileExists(skillPath));
}

/**
 * Check if Superpowers skills are installed.
 */
async function isSuperpowersInstalled(projectPath: string): Promise<boolean> {
  const skillPath = path.join(projectPath, '.claude', 'skills', 'superpowers-brainstorming', 'SKILL.md');
  return fileExists(skillPath);
}

/**
 * Check if Comet skills are installed.
 */
async function isCometInstalled(projectPath: string): Promise<boolean> {
  const skillPath = path.join(projectPath, '.claude', 'skills', 'comet', 'SKILL.md');
  return fileExists(skillPath);
}

/**
 * Install OpenSpec globally and initialize it in the project.
 */
async function installOpenSpec(projectPath: string): Promise<void> {
  console.log('Installing OpenSpec...');
  try {
    execSync('npm install -g @fission-ai/openspec@latest', { stdio: 'inherit' });
    console.log('Running openspec init...');
    execSync('openspec init', { cwd: projectPath, stdio: 'inherit' });
    console.log('OpenSpec installed successfully.');
  } catch (error) {
    console.error('Failed to install OpenSpec:', (error as Error).message);
    console.log('Please install manually: npm install -g @fission-ai/openspec@latest && openspec init');
  }
}

/**
 * Install Superpowers skills.
 */
async function installSuperpowers(projectPath: string): Promise<void> {
  console.log('Installing Superpowers...');
  try {
    execSync('npx skills add obra/superpowers -g -y', { cwd: projectPath, stdio: 'inherit' });
    console.log('Superpowers installed successfully.');
  } catch (error) {
    console.error('Failed to install Superpowers:', (error as Error).message);
    console.log('Please install manually: npx skills add obra/superpowers -g -y');
  }
}

/**
 * Copy Comet skill files from assets to the project's .claude/skills directory.
 */
async function copyCometSkills(projectPath: string, overwrite: boolean): Promise<number> {
  const assetsDir = getAssetsDir();
  const manifestPath = path.join(assetsDir, 'manifest.json');

  if (!(await fileExists(manifestPath))) {
    throw new Error(`Manifest not found at ${manifestPath}`);
  }

  const manifest = await readJson<Manifest>(manifestPath);
  let copied = 0;

  for (const skillRelPath of manifest.skills) {
    const src = path.join(assetsDir, 'skills', skillRelPath);
    const dest = path.join(projectPath, '.claude', 'skills', skillRelPath);

    if (!overwrite && (await fileExists(dest))) {
      continue;
    }

    await copyFile(src, dest);
    copied++;
  }

  return copied;
}

/**
 * Create Superpowers working directories.
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
 * Main init command.
 */
export async function initCommand(targetPath: string, options: InitOptions = {}): Promise<void> {
  const projectPath = path.resolve(targetPath);

  console.log(`Setting up Comet in ${projectPath}...`);
  console.log();

  // Detect installed components
  const hasOpenSpec = await isOpenSpecInstalled(projectPath);
  const hasSuperpowers = await isSuperpowersInstalled(projectPath);
  const hasComet = await isCometInstalled(projectPath);

  // Install OpenSpec if missing
  if (!hasOpenSpec) {
    if (options.yes) {
      await installOpenSpec(projectPath);
    } else {
      console.log('OpenSpec not found. Install with: npm install -g @fission-ai/openspec@latest && openspec init');
    }
  } else {
    console.log('OpenSpec: already installed');
  }

  // Install Superpowers if missing
  if (!hasSuperpowers) {
    if (options.yes) {
      await installSuperpowers(projectPath);
    } else {
      console.log('Superpowers not found. Install with: npx skills add obra/superpowers -g -y');
    }
  } else {
    console.log('Superpowers: already installed');
  }

  // Copy Comet skills
  if (hasComet && !options.overwrite && !options.skipExisting) {
    console.log('Comet skills: already installed (use --overwrite to replace)');
  } else if (hasComet && options.skipExisting) {
    console.log('Comet skills: skipped (--skip-existing)');
  } else {
    const copied = await copyCometSkills(projectPath, options.overwrite ?? false);
    console.log(`Comet skills: ${copied} files copied`);
  }

  // Create working directories
  await createWorkingDirs(projectPath);
  console.log('Working directories: docs/superpowers/specs/, docs/superpowers/plans/');

  console.log();
  console.log('Comet setup complete!');
  console.log();
  console.log('Get started:');
  console.log('  /comet "your idea"  — Start a new change with full workflow');
  console.log('  /comet-hotfix       — Quick bug fix (skip brainstorming)');
  console.log('  /comet-tweak        — Small change (skip brainstorming and plan)');
}
