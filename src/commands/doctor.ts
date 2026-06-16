import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import { fileExists, readDir } from '../utils/file-system.js';
import { isCommandAvailable } from '../core/openspec.js';
import { readManifest, getAssetsDir } from '../core/skills.js';
import { PLATFORMS, getPlatformSkillsDirs } from '../core/platforms.js';
import type { InstallScope } from '../core/types.js';

interface CheckResult {
  check: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
}

type DoctorScope = InstallScope | 'auto';

const VALID_YAML_FIELDS = new Set([
  'workflow',
  'phase',
  'build_mode',
  'isolation',
  'verify_mode',
  'verify_result',
  'design_doc',
  'plan',
  'verification_report',
  'branch_status',
  'archived',
  'verified_at',
]);

function collectTopLevelYamlKeys(yamlContent: string): string[] {
  const topLevelKeys: string[] = [];

  for (const line of yamlContent.split(/\r?\n/u)) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) continue;
    if (/^\s/u.test(line)) continue;
    if (trimmedLine.startsWith('- ')) continue;

    const keyMatch = line.match(/^['"]?([A-Za-z0-9_-]+)['"]?\s*:/u);
    if (keyMatch) {
      topLevelKeys.push(keyMatch[1]);
    }
  }

  return topLevelKeys;
}

function readYamlField(yamlContent: string, field: string): string | null {
  for (const line of yamlContent.split(/\r?\n/u)) {
    const match = line.match(new RegExp(`^${field}:\\s*(.*)$`, 'u'));
    if (!match) continue;
    return match[1]
      .replace(/\s+#.*$/u, '')
      .replace(/^['"]|['"]$/gu, '')
      .trim();
  }
  return null;
}

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

function getScopeBases(
  projectPath: string,
  scope: DoctorScope,
): Array<{
  scope: InstallScope;
  baseDir: string;
}> {
  if (scope === 'project') return [{ scope, baseDir: projectPath }];
  if (scope === 'global') return [{ scope, baseDir: os.homedir() }];

  const bases: Array<{ scope: InstallScope; baseDir: string }> = [
    { scope: 'project', baseDir: projectPath },
  ];
  if (path.resolve(projectPath) !== path.resolve(os.homedir())) {
    bases.push({ scope: 'global', baseDir: os.homedir() });
  }
  return bases;
}

async function checkSkillCompleteness(
  projectPath: string,
  scope: DoctorScope,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const manifest = await readManifest();

  let anyPlatform = false;
  for (const base of getScopeBases(projectPath, scope)) {
    for (const platform of PLATFORMS) {
      const detectedSkillsDir = (
        await Promise.all(
          getPlatformSkillsDirs(platform, base.scope).map(async (skillsDir) => ({
            skillsDir,
            exists: await fileExists(path.join(base.baseDir, skillsDir, 'skills')),
          })),
        )
      ).find((candidate) => candidate.exists)?.skillsDir;
      if (!detectedSkillsDir) continue;

      const skillsDir = path.join(base.baseDir, detectedSkillsDir, 'skills');
      if (!(await fileExists(skillsDir))) continue;
      anyPlatform = true;

      const missing: string[] = [];
      for (const relPath of manifest.skills) {
        const fullPath = path.join(base.baseDir, detectedSkillsDir, 'skills', relPath);
        if (!(await fileExists(fullPath))) {
          missing.push(relPath);
        }
      }

      results.push(
        missing.length === 0
          ? {
              check: `skills: ${platform.name} (${base.scope})`,
              status: 'pass' as const,
              message: `complete (${manifest.skills.length} files)`,
            }
          : {
              check: `skills: ${platform.name} (${base.scope})`,
              status: 'warn' as const,
              message: `missing ${missing.length}: ${missing.join(', ')}`,
            },
      );
    }
  }

  if (!anyPlatform) {
    results.push({
      check: 'skills',
      status: 'warn',
      message:
        scope === 'auto'
          ? 'no platforms detected in project or global scope — run comet init'
          : `no platforms detected in ${scope} scope — run comet init`,
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
    const unknownFields = collectTopLevelYamlKeys(raw).filter((key) => !VALID_YAML_FIELDS.has(key));

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

async function checkCodegraph(projectPath: string, scope: DoctorScope): Promise<CheckResult> {
  if (!isCommandAvailable('codegraph')) {
    return {
      check: 'CodeGraph CLI',
      status: 'warn',
      message: 'not installed — install with: npm install -g @colbymchenry/codegraph',
    };
  }

  if (scope === 'global') {
    return { check: 'CodeGraph CLI', status: 'pass', message: 'installed' };
  }

  const codegraphDir = path.join(projectPath, '.codegraph');
  if (!(await fileExists(codegraphDir))) {
    return {
      check: 'CodeGraph',
      status: 'warn',
      message: 'CLI installed but project not initialized — run: codegraph init -i',
    };
  }

  return { check: 'CodeGraph', status: 'pass', message: 'initialized (.codegraph/ present)' };
}

async function collectWorkflowResults(projectPath: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const changesDir = path.join(projectPath, 'openspec', 'changes');
  const activeChanges: string[] = [];

  if (await fileExists(changesDir)) {
    for (const entry of await readDir(changesDir)) {
      if (entry === 'archive') continue;
      const yamlPath = path.join(changesDir, entry, '.comet.yaml');
      if (await fileExists(yamlPath)) {
        activeChanges.push(entry);
      }
    }
  }

  results.push({
    check: 'workflow: active changes',
    status: activeChanges.length > 0 ? 'pass' : 'warn',
    message:
      activeChanges.length > 0
        ? `${activeChanges.length} active (${activeChanges.join(', ')})`
        : 'none found',
  });

  results.push({
    check: 'workflow: CodeGraph index',
    status: (await fileExists(path.join(projectPath, '.codegraph'))) ? 'pass' : 'warn',
    message: (await fileExists(path.join(projectPath, '.codegraph')))
      ? 'present'
      : 'missing — run: codegraph init -i',
  });

  results.push({
    check: 'workflow: Understand Anything graph',
    status: (await fileExists(
      path.join(projectPath, '.understand-anything', 'knowledge-graph.json'),
    ))
      ? 'pass'
      : 'warn',
    message: (await fileExists(
      path.join(projectPath, '.understand-anything', 'knowledge-graph.json'),
    ))
      ? 'present'
      : 'missing — run: /understand --language <lang>',
  });

  const configFiles = ['.comet.yaml', 'comet.yaml', '.comet.yml', 'comet.yml'];
  let buildCommand: string | null = null;
  let verifyCommand: string | null = null;
  for (const configFile of configFiles) {
    const configPath = path.join(projectPath, configFile);
    if (!(await fileExists(configPath))) continue;
    const raw = await fs.readFile(configPath, 'utf-8');
    buildCommand ??= readYamlField(raw, 'build_command');
    verifyCommand ??= readYamlField(raw, 'verify_command');
  }

  results.push({
    check: 'workflow: build command',
    status: buildCommand ? 'pass' : 'warn',
    message: buildCommand ? `configured (${buildCommand})` : 'not configured',
  });
  results.push({
    check: 'workflow: verify command',
    status: verifyCommand ? 'pass' : 'warn',
    message: verifyCommand ? `configured (${verifyCommand})` : 'not configured',
  });

  for (const change of activeChanges) {
    const evidencePath = path.join(changesDir, change, '.comet', 'evidence.jsonl');
    results.push({
      check: `workflow: evidence: ${change}`,
      status: (await fileExists(evidencePath)) ? 'pass' : 'warn',
      message: (await fileExists(evidencePath)) ? 'present' : 'missing',
    });
  }

  return results;
}

async function collectResults(
  projectPath: string,
  scope: DoctorScope,
  workflow = false,
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  results.push(await checkOpenSpecCli());
  if (scope !== 'global') {
    results.push(await checkWorkingDirs(projectPath));
  }
  results.push(...(await checkSkillCompleteness(projectPath, scope)));
  results.push(await checkScriptsPresent());
  results.push(await checkCodegraph(projectPath, scope));
  results.push(...(await checkCometYamlValidity(projectPath)));
  if (workflow && scope !== 'global') {
    results.push(...(await collectWorkflowResults(projectPath)));
  }
  return results;
}

function icon(status: string): string {
  if (status === 'pass') return '✓';
  if (status === 'warn') return '⚠';
  return '✗';
}

interface DoctorOptions {
  json?: boolean;
  scope?: DoctorScope;
  workflow?: boolean;
}

export async function doctorCommand(
  targetPath: string,
  options: DoctorOptions = {},
): Promise<void> {
  const projectPath = path.resolve(targetPath);
  const scope = options.scope ?? 'auto';
  const workflow = options.workflow === true;
  const results = await collectResults(projectPath, scope, workflow);

  if (options.json) {
    console.log(
      JSON.stringify(workflow ? { scope, workflow, results } : { scope, results }, null, 2),
    );
    return;
  }

  console.log(`Comet Doctor (scope: ${scope}${workflow ? ', workflow: on' : ''})\n`);

  for (const r of results) {
    console.log(`  ${icon(r.status)} ${r.check}: ${r.message}`);
  }

  console.log();
}
