import { spawn } from 'node:child_process';
import path from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { Command, Option } from 'commander';
import { EvidenceRunner, type EvidencePhase } from '../evidence/evidence-runner.js';
import { CodeGraphAdapter, graphProvider, type GraphResult } from '../graph/graph-provider.js';
import { MemoryCatalog } from '../memory/memory-catalog.js';
import { readProjectConfig } from '../project/config.js';
import { doctorProject } from '../project/doctor.js';
import { initializeProject } from '../project/initialize.js';
import { projectStatus } from '../project/status.js';
import { RuntimeProjector, uninstallRuntime } from '../runtime/runtime-projector.js';
import { SPEC_PILOT_VERSION, type GraphMode, type Host, type ProjectConfig } from '../types.js';
import { writeJsonAtomic } from '../utils/files.js';
import { WorkflowHarness } from '../workflow/workflow-harness.js';

interface CommonOutputOptions {
  json?: boolean;
}

function print(value: unknown, json: boolean | undefined): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  if (typeof value === 'string') console.log(value);
  else console.log(JSON.stringify(value, null, 2));
}

function run(
  executable: string,
  args: string[],
  cwd: string,
): Promise<{ exitCode: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => (output += chunk.toString()));
    child.stderr.on('data', (chunk) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 1, output }));
  });
}

function hostsFromOption(host: string | undefined): Host[] {
  if (host === 'claude') return ['claude'];
  if (host === 'codex') return ['codex'];
  return ['claude', 'codex'];
}

async function configureCodeGraph(root: string, allowInstall: boolean): Promise<string[]> {
  const warnings: string[] = [];
  let adapter = new CodeGraphAdapter(root);
  let readiness = await adapter.readiness();
  if (!readiness.available && allowInstall) {
    const install = await run('npm', ['install', '--global', '@colbymchenry/codegraph'], root);
    if (install.exitCode !== 0) {
      warnings.push(`CodeGraph installation failed: ${install.output.trim()}`);
      return warnings;
    }
    adapter = new CodeGraphAdapter(root);
    readiness = await adapter.readiness();
  }
  if (!readiness.available) {
    warnings.push('CodeGraph is unavailable; SpecPilot will use source search fallback.');
    return warnings;
  }
  if (!readiness.indexed) {
    try {
      await adapter.initialize();
    } catch (error) {
      warnings.push(
        `CodeGraph initialization failed; source search fallback remains available: ${(error as Error).message}`,
      );
    }
  }
  return warnings;
}

async function configuredGraph(root: string) {
  let mode: GraphMode = 'none';
  try {
    mode = (await readProjectConfig(root)).graph.provider;
  } catch {
    // An uninitialized project still has a useful source-search fallback.
  }
  return graphProvider(root, mode);
}

function graphText(result: GraphResult): string {
  const warning = result.warnings.map((item) => `Warning: ${item}`).join('\n');
  return `${result.output}${result.output ? '\n\n' : ''}${warning}`;
}

const program = new Command()
  .name('specpilot')
  .description('Repository-backed spec workflow for Claude Code and Codex')
  .version(SPEC_PILOT_VERSION);

program
  .command('init [target] [path]')
  .description('Initialize the SpecPilot harness or its project knowledge inventory')
  .addOption(new Option('--host <host>').choices(['claude', 'codex', 'all']))
  .addOption(new Option('--graph <provider>').choices(['codegraph', 'none']))
  .option('--dry-run', 'Preview all writes without changing the project')
  .option('--yes', 'Run non-interactively')
  .option('--json', 'Print machine-readable JSON')
  .action(
    async (
      target = '.',
      nestedPath: string | undefined,
      options: {
        host?: string;
        graph?: GraphMode;
        dryRun?: boolean;
        yes?: boolean;
        json?: boolean;
      },
    ) => {
      if (target === 'knowledge') {
        const root = path.resolve(nestedPath ?? '.');
        await readProjectConfig(root);
        const result = await new MemoryCatalog(root).initializeKnowledge({
          dryRun: options.dryRun,
        });
        print(
          options.json
            ? result
            : `${options.dryRun ? 'Knowledge inventory previewed' : 'Knowledge inventory written'} at ${result.reportPath}.\n` +
                'No durable knowledge was promoted.\n' +
                'Next: invoke specpilot-init-knowledge in Claude Code or Codex.',
          options.json,
        );
        return;
      }
      if (nestedPath !== undefined) {
        throw new Error('a second path argument is only valid for `specpilot init knowledge`');
      }
      const root = path.resolve(target);
      const interactive = !options.yes && !options.json && !options.dryRun;
      const hostChoice =
        options.host ??
        (interactive
          ? await select({
              message: 'Project runtime hosts',
              default: 'all',
              choices: [
                { name: 'Claude Code and Codex', value: 'all' },
                { name: 'Claude Code', value: 'claude' },
                { name: 'Codex', value: 'codex' },
              ],
            })
          : 'all');
      const graphChoice =
        options.graph ??
        (interactive
          ? await select({
              message: 'Code intelligence provider',
              default: 'codegraph',
              choices: [
                { name: 'CodeGraph (recommended)', value: 'codegraph' as const },
                { name: 'Source search only', value: 'none' as const },
              ],
            })
          : options.dryRun
            ? 'codegraph'
            : 'none');
      const initOptions = {
        projectPath: root,
        hosts: hostsFromOption(hostChoice),
        graph: graphChoice,
        dryRun: options.dryRun,
      };
      const preview = await initializeProject({ ...initOptions, dryRun: true });
      if (interactive) {
        console.log(
          `\nSpecPilot will manage:\n${preview.plannedPaths.map((item) => `  ${item}`).join('\n')}`,
        );
        if (graphChoice === 'codegraph') {
          console.log('  CodeGraph CLI installation/indexing if needed (no global MCP edits)');
        }
        if (!(await confirm({ message: 'Apply this initialization?', default: true }))) {
          console.log('Cancelled.');
          return;
        }
      }
      if (options.dryRun) {
        print(preview, options.json);
        return;
      }
      const result = await initializeProject(initOptions);
      if (graphChoice === 'codegraph') {
        result.warnings.push(
          ...(await configureCodeGraph(root, options.graph === 'codegraph' || interactive)),
        );
      }
      print(
        options.json
          ? result
          : `SpecPilot ${SPEC_PILOT_VERSION} initialized in ${root}.\n` +
              `Next: invoke specpilot-start in ${hostChoice === 'all' ? 'Claude Code or Codex' : hostChoice}.` +
              (result.warnings.length ? `\nWarnings:\n${result.warnings.join('\n')}` : ''),
        options.json,
      );
    },
  );

program
  .command('status [path]')
  .description('Show open changes, task progress, missing gates, and the next workflow')
  .option('--json', 'Print machine-readable JSON')
  .action(async (target = '.', options: CommonOutputOptions) => {
    const status = await projectStatus(target);
    if (options.json) return print(status, true);
    const changes =
      status.openChanges.length === 0
        ? 'No open changes.'
        : status.openChanges
            .map((change) => {
              const tasks = change.tasks
                ? `${change.tasks.done}/${change.tasks.total} tasks done`
                : 'invalid tasks';
              const missing =
                change.missing.length > 0 ? `\n    Missing: ${change.missing.join('; ')}` : '';
              return `- ${change.id}: ${tasks}, gate ${change.gate}${missing}`;
            })
            .join('\n');
    print(`${changes}\nRecommended: ${status.recommendedWorkflow}`, false);
  });

program
  .command('doctor [path]')
  .description('Check config, runtime drift, graph readiness, artifacts, and evidence')
  .option('--json', 'Print machine-readable JSON')
  .action(async (target = '.', options: CommonOutputOptions) => {
    const report = await doctorProject(target);
    if (options.json) return print(report, true);
    print(
      report.checks
        .map((check) => `${check.status.toUpperCase()} ${check.name}: ${check.detail}`)
        .join('\n'),
      false,
    );
    if (!report.healthy) process.exitCode = 1;
  });

const graph = program.command('graph').description('Provider-neutral code graph operations');
graph
  .command('status [path]')
  .option('--json')
  .action(async (target = '.', options: CommonOutputOptions) => {
    let mode: GraphMode = 'none';
    try {
      mode = (await readProjectConfig(target)).graph.provider;
    } catch {
      // Report fallback readiness for uninitialized projects.
    }
    const readiness =
      mode === 'codegraph'
        ? await new CodeGraphAdapter(target).readiness()
        : await (await configuredGraph(target)).readiness();
    print(readiness, options.json);
  });
graph
  .command('explore <query> [path]')
  .option('--json')
  .action(async (query: string, target = '.', options: CommonOutputOptions) => {
    const result = await (await configuredGraph(target)).explore(query);
    print(options.json ? result : graphText(result), options.json);
  });
graph
  .command('impact <symbol> [path]')
  .option('--json')
  .action(async (symbol: string, target = '.', options: CommonOutputOptions) => {
    const result = await (await configuredGraph(target)).impact(symbol);
    print(options.json ? result : graphText(result), options.json);
  });
graph
  .command('affected <files...>')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(async (files: string[], options: CommonOutputOptions & { path: string }) => {
    const result = await (await configuredGraph(options.path)).affected(files);
    print(options.json ? result : graphText(result), options.json);
  });

program
  .command('verify')
  .description('Record reproducible verification evidence')
  .command('run')
  .requiredOption('--change <id>')
  .requiredOption('--task <id>')
  .addOption(new Option('--phase <phase>').choices(['red', 'green', 'final']).makeOptionMandatory())
  .option('--reason <reason>', 'Why a red command is expected to fail')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .argument('<command...>')
  .action(
    async (
      command: string[],
      options: {
        change: string;
        task: string;
        phase: EvidencePhase;
        reason?: string;
        path: string;
        json?: boolean;
      },
    ) => {
      const record = await new EvidenceRunner(options.path).run({
        changeId: options.change,
        taskId: options.task,
        phase: options.phase,
        reason: options.reason,
        command,
      });
      print(record, options.json);
      if (!record.valid) process.exitCode = 1;
    },
  );

program
  .command('update [path]')
  .description('Refresh only the SpecPilot-managed runtime')
  .option('--json')
  .action(async (target = '.', options: CommonOutputOptions) => {
    const root = path.resolve(target);
    const config = await readProjectConfig(root);
    const updated: ProjectConfig = { ...config, managed_version: SPEC_PILOT_VERSION };
    await new RuntimeProjector(root, config.hosts).apply(SPEC_PILOT_VERSION);
    await writeJsonAtomic(path.join(root, '.specpilot', 'config.json'), updated);
    print(
      options.json
        ? { root, managedVersion: SPEC_PILOT_VERSION, updated: true }
        : `Updated SpecPilot-managed runtime to ${SPEC_PILOT_VERSION}.`,
      options.json,
    );
  });

program
  .command('uninstall [path]')
  .description('Remove managed runtime/config while preserving project artifacts')
  .option('--yes', 'Skip confirmation')
  .option('--json')
  .action(async (target = '.', options: CommonOutputOptions & { yes?: boolean }) => {
    const root = path.resolve(target);
    if (
      !options.yes &&
      !options.json &&
      !(await confirm({
        message:
          'Remove SpecPilot-managed runtime and config? Specs, tasks, knowledge, and evidence are preserved.',
        default: false,
      }))
    ) {
      console.log('Cancelled.');
      return;
    }
    const result = await uninstallRuntime(root);
    print(result, options.json);
  });

const internal = program
  .command('internal', { hidden: true })
  .description('Agent runtime operations');
internal
  .command('finish')
  .requiredOption('--change <id>')
  .option('--path <path>', 'Project path', '.')
  .option('--apply')
  .option('--json')
  .action(async (options: { change: string; path: string; apply?: boolean; json?: boolean }) => {
    const result = await new WorkflowHarness(options.path).finish(options.change, {
      apply: options.apply,
    });
    print(result, options.json);
    if (result.status === 'blocked') process.exitCode = 1;
  });
internal
  .command('memory-search <query>')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(async (query: string, options: { path: string; json?: boolean }) => {
    print(await new MemoryCatalog(options.path).search(query), options.json);
  });
internal
  .command('memory-promote <candidate>')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(async (candidate: string, options: { path: string; json?: boolean }) => {
    const promoted = await new MemoryCatalog(options.path).promote(candidate);
    print(options.json ? { promoted } : `Promoted ${promoted}`, options.json);
  });

await program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof Error && error.name === 'ExitPromptError') {
    console.error('Cancelled.');
    process.exitCode = 1;
    return;
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
