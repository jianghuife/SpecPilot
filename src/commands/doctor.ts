import path from 'path';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { fileExists, readDir } from '../utils/file-system.js';
import { isCommandAvailable } from '../core/openspec.js';
import { readManifest, getAssetsDir } from '../core/skills.js';
import { PLATFORMS } from '../core/platforms.js';

interface CheckResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

const VALID_YAML_FIELDS = new Set([
  'workflow',
  'phase',
  'build_mode',
  'isolation',
  'verify_mode',
  'verify_result',
  'design_doc',
  'plan',
  'archived',
  'verified_at',
]);

async function checkOpenSpecCli(): Promise<CheckResult> {
  if (!isCommandAvailable('openspec')) {
    return {
      check: 'openspec CLI',
      status: 'warn',
      message: 'not installed — install with: npm install -g @fission-ai/openspec@latest',
    };
  }
  try {
    const version = execSync('openspec --version', { stdio: 'pipe', timeout: 10_000 })
      .toString()
      .trim();
    return { check: 'openspec CLI', status: 'pass', message: `installed (${version})` };
  } catch {
    return { check: 'openspec CLI', status: 'pass', message: 'installed' };
  }
}

async function checkWorkingDirs(projectPath: string): Promise<CheckResult> {
  const specsDir = path.join(projectPath, 'docs', 'superpowers', 'specs');
  const plansDir = path.join(projectPath, 'docs', 'superpowers', 'plans');
  const specsExist = await fileExists(specsDir);
  const plansExist = await fileExists(plansDir);

  if (specsExist && plansExist) {
    return { check: 'working directories', status: 'pass', message: 'present' };
  }
  if (!specsExist && !plansExist) {
    return { check: 'working directories', status: 'fail', message: 'missing — run: comet init' };
  }
  const missing = [];
  if (!specsExist) missing.push('specs');
  if (!plansExist) missing.push('plans');
  return {
    check: 'working directories',
    status: 'warn',
    message: `partial (missing: ${missing.join(', ')})`,
  };
}

async function checkSkillCompleteness(projectPath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const manifest = await readManifest();

  let anyPlatform = false;
  for (const platform of PLATFORMS) {
    const skillsDir = path.join(projectPath, platform.skillsDir, 'skills');
    if (!(await fileExists(skillsDir))) continue;
    anyPlatform = true;

    const missing: string[] = [];
    for (const relPath of manifest.skills) {
      const fullPath = path.join(projectPath, platform.skillsDir, 'skills', relPath);
      if (!(await fileExists(fullPath))) {
        missing.push(relPath);
      }
    }

    results.push(
      missing.length === 0
        ? {
            check: `skills: ${platform.name}`,
            status: 'pass' as const,
            message: `complete (${manifest.skills.length} files)`,
          }
        : {
            check: `skills: ${platform.name}`,
            status: 'warn' as const,
            message: `missing ${missing.length}: ${missing.join(', ')}`,
          },
    );
  }

  if (!anyPlatform) {
    results.push({
      check: 'skills',
      status: 'warn',
      message: 'no platforms detected — run comet init',
    });
  }

  return results;
}

async function checkScriptsPresent(): Promise<CheckResult> {
  const assetsDir = getAssetsDir();
  const scriptsDir = path.join(assetsDir, 'skills', 'comet', 'scripts');
  if (!(await fileExists(scriptsDir))) {
    return { check: 'scripts present', status: 'warn', message: 'scripts directory not found' };
  }

  const entries = await readDir(scriptsDir);
  const shFiles = entries.filter((e) => e.endsWith('.sh'));

  return {
    check: 'scripts executable',
    status: 'pass',
    message: `OK (${shFiles.length} scripts)`,
  };
}

async function checkCometYamlValidity(projectPath: string): Promise<CheckResult[]> {
  const changesDir = path.join(projectPath, 'openspec', 'changes');
  if (!(await fileExists(changesDir))) return [];

  const entries = await readDir(changesDir);
  const results: CheckResult[] = [];

  for (const entry of entries) {
    const yamlPath = path.join(changesDir, entry, '.comet.yaml');
    if (!(await fileExists(yamlPath))) continue;

    const raw = await fs.readFile(yamlPath, 'utf-8');
    const unknownFields: string[] = [];

    for (const line of raw.split('\n')) {
      const match = line.match(/^(\w[\w_]*):/);
      if (match && !VALID_YAML_FIELDS.has(match[1])) {
        unknownFields.push(match[1]);
      }
    }

    results.push(
      unknownFields.length === 0
        ? { check: `.comet.yaml: ${entry}`, status: 'pass' as const, message: 'valid' }
        : {
            check: `.comet.yaml: ${entry}`,
            status: 'fail' as const,
            message: `unknown field(s): ${unknownFields.join(', ')}`,
          },
    );
  }

  return results;
}

async function collectResults(projectPath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  results.push(await checkOpenSpecCli());
  results.push(await checkWorkingDirs(projectPath));
  results.push(...(await checkSkillCompleteness(projectPath)));
  results.push(await checkScriptsPresent());
  results.push(...(await checkCometYamlValidity(projectPath)));
  return results;
}

function icon(status: string): string {
  if (status === 'pass') return '✓';
  if (status === 'warn') return '⚠';
  return '✗';
}

interface DoctorOptions {
  json?: boolean;
}

export async function doctorCommand(
  targetPath: string,
  options: DoctorOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const results = await collectResults(projectPath);

  if (options.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }

  console.log('Comet Doctor\n');

  for (const r of results) {
    console.log(`  ${icon(r.status)} ${r.check}: ${r.message}`);
  }

  console.log();
}
