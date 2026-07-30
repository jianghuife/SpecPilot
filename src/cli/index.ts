import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { confirm, select } from '@inquirer/prompts';
import { Command, Option } from 'commander';
import { EvidenceRunner, type EvidencePhase } from '../evidence/evidence-runner.js';
import { CodeGraphAdapter, graphProvider, type GraphResult } from '../graph/graph-provider.js';
import { MemoryCatalog } from '../memory/memory-catalog.js';
import { findProjectRoot, normalizeOptionalSkills, readProjectConfig } from '../project/config.js';
import { doctorProject } from '../project/doctor.js';
import { initializeProject } from '../project/initialize.js';
import {
  ProjectStore,
  type ChangeKind,
  type ContextPurpose,
  type ReviewAxisStatus,
  type TaskExecution,
  type TaskTransition,
} from '../project/project-store.js';
import { projectStatus } from '../project/status.js';
import {
  listBundledOptionalSkills,
  RuntimeProjector,
  uninstallRuntime,
  type RuntimeProjectorOptions,
} from '../runtime/runtime-projector.js';
import { SPEC_PILOT_VERSION, type GraphMode, type Host, type ProjectConfig } from '../types.js';
import { writeJsonAtomic } from '../utils/files.js';
import { WorkflowHarness, type WorkflowStateSnapshot } from '../workflow/workflow-harness.js';

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

function assertNotRunWithSudo(): void {
  if (!process.env.SUDO_UID && !process.env.SUDO_USER) return;
  throw new Error(
    'Do not run SpecPilot with sudo: it would create root-owned repository files. ' +
      'Run the command again as your normal user. If a previous sudo run already wrote files, ' +
      'restore ownership of the repository before retrying (for example: ' +
      'sudo chown -R "$(id -u):$(id -g)" /path/to/repository).',
  );
}

function hostsFromOption(host: string | undefined): Host[] {
  if (host === 'claude') return ['claude'];
  if (host === 'codex') return ['codex'];
  return ['claude', 'codex'];
}

async function configureCodeGraph(root: string): Promise<string[]> {
  const warnings: string[] = [];
  const adapter = new CodeGraphAdapter(root);
  const readiness = await adapter.readiness();
  if (!readiness.available) {
    warnings.push(
      'CodeGraph is unavailable. Install it separately with ' +
        '`npm install --global @colbymchenry/codegraph` (use sudo only for that system ' +
        'installation if required), then rerun this init command. Source search fallback ' +
        'remains available.',
    );
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

async function applyManagedRuntime(
  root: string,
  overrides: RuntimeProjectorOptions = {},
): Promise<ProjectConfig> {
  const config = await readProjectConfig(root);
  const perTurnState = overrides.perTurnState ?? config.context.per_turn_state;
  const optionalSkills = overrides.optionalSkills ?? config.optional_skills;
  await new RuntimeProjector(root, config.hosts, { perTurnState, optionalSkills }).apply(
    SPEC_PILOT_VERSION,
  );
  const updated: ProjectConfig = {
    ...config,
    managed_version: SPEC_PILOT_VERSION,
    context: { per_turn_state: perTurnState },
    optional_skills: optionalSkills,
  };
  await writeJsonAtomic(path.join(root, '.specpilot', 'config.json'), updated);
  return updated;
}

async function readHookInput(): Promise<Record<string, unknown>> {
  let input = '';
  for await (const chunk of process.stdin) input += chunk.toString();
  if (input.trim() === '') return {};
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function promptContextText(state: WorkflowStateSnapshot): string {
  const lines = ['<specpilot-state>'];
  if (!state.active) {
    lines.push('Active: none');
  } else {
    lines.push(
      `Active: ${state.active.change ?? 'unknown'}${state.active.task ? `/${state.active.task}` : ''}`,
    );
    if (state.active.changeStatus) lines.push(`Change status: ${state.active.changeStatus}`);
    if (state.active.taskStatus) lines.push(`Task status: ${state.active.taskStatus}`);
    lines.push(`Pointer stale: ${state.active.stale}`);
  }
  lines.push(`Next: ${state.next}`);
  if (state.context) {
    lines.push(
      `Context(${state.context.purpose}): ${state.context.count} references; missing ${state.context.missing.length}`,
    );
  }
  lines.push('</specpilot-state>');
  return lines.join('\n');
}

const program = new Command()
  .name('specpilot')
  .description('Repository-backed spec workflow for Claude Code and Codex')
  .version(SPEC_PILOT_VERSION);

program.hook('preAction', assertNotRunWithSudo);

program
  .command('init [target] [path]')
  .description('Initialize the SpecPilot harness or its project knowledge inventory')
  .addOption(new Option('--host <host>').choices(['claude', 'codex', 'all']))
  .addOption(new Option('--graph <provider>').choices(['codegraph', 'none']))
  .option('--context-injection', 'Enable lightweight per-turn workflow-state injection')
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
        contextInjection?: boolean;
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
        perTurnState: options.contextInjection,
        dryRun: options.dryRun,
      };
      const preview = await initializeProject({ ...initOptions, dryRun: true });
      if (interactive) {
        console.log(
          `\nSpecPilot will manage:\n${preview.plannedPaths.map((item) => `  ${item}`).join('\n')}`,
        );
        if (graphChoice === 'codegraph') {
          console.log('  CodeGraph readiness/indexing if its CLI is already installed');
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
        result.warnings.push(...(await configureCodeGraph(root)));
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

const change = program
  .command('change')
  .description('Scaffold and approve repository-backed changes');
change
  .command('new <id>')
  .description('Create specs/changes/<id> with a validated change.yaml and document stubs')
  .requiredOption('--title <title>', 'Human-readable change title')
  .addOption(new Option('--kind <kind>').choices(['light', 'standard']).default('light'))
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(
    async (
      id: string,
      options: { title: string; kind: ChangeKind; path: string; json?: boolean },
    ) => {
      const result = await new ProjectStore(options.path).createChange({
        id,
        title: options.title,
        kind: options.kind,
      });
      print(
        options.json
          ? result
          : `Created change ${id}:\n${result.writtenPaths.map((item) => `  ${item}`).join('\n')}\n` +
              `Next: fill in spec.md, add tasks with \`specpilot task add\`, then run ` +
              `\`specpilot change approve ${id}\` after the user approves the spec.`,
        options.json,
      );
    },
  );
change
  .command('approve <id>')
  .description('Record spec approval; finish is blocked until the spec is approved')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(async (id: string, options: { path: string; json?: boolean }) => {
    const approved = await new WorkflowHarness(options.path).approveSpec(id);
    print(
      options.json ? approved : `Approved spec for ${id} at ${approved.spec_approved_at}.`,
      options.json,
    );
  });

const task = program.command('task').description('Scaffold tasks inside an open change');
task
  .command('add <change> <id>')
  .description('Create tasks/<id>.md with validated frontmatter')
  .requiredOption('--title <title>', 'Human-readable task title')
  .addOption(new Option('--execution <execution>').choices(['standard', 'tdd']).default('standard'))
  .option('--blocked-by <tasks...>', 'Task ids this task depends on')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(
    async (
      changeId: string,
      id: string,
      options: {
        title: string;
        execution: TaskExecution;
        blockedBy?: string[];
        path: string;
        json?: boolean;
      },
    ) => {
      const filePath = await new ProjectStore(options.path).addTask(changeId, {
        id,
        title: options.title,
        execution: options.execution,
        blockedBy: options.blockedBy,
      });
      print(options.json ? { filePath } : `Created ${filePath}`, options.json);
    },
  );

function registerTaskTransition(
  name: TaskTransition,
  description: string,
  requiresReason = false,
): void {
  const command = task
    .command(`${name} <change> <id>`)
    .description(description)
    .option('--path <path>', 'Project path', '.')
    .option('--json');
  if (requiresReason) {
    command.requiredOption(
      '--reason <reason>',
      `Why the task is ${name === 'block' ? 'blocked' : 'waived'}`,
    );
  }
  command.action(
    async (
      changeId: string,
      taskId: string,
      options: { path: string; json?: boolean; reason?: string },
    ) => {
      const result = await new WorkflowHarness(options.path).transitionTask(
        changeId,
        taskId,
        name,
        options.reason,
      );
      print(result, options.json);
    },
  );
}

registerTaskTransition('start', 'Start an unblocked task and activate its local session pointer');
registerTaskTransition('complete', 'Complete a doing task after fresh green evidence');
registerTaskTransition('block', 'Block a todo or doing task with a reason', true);
registerTaskTransition('waive', 'Waive a todo, doing, or blocked task with a reason', true);

const session = program
  .command('session')
  .description('Manage the local active change/task pointer');
session
  .command('activate <change> [task]')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(
    async (
      changeId: string,
      taskId: string | undefined,
      options: { path: string; json?: boolean },
    ) => {
      const active = await new WorkflowHarness(options.path).activateSession(changeId, taskId);
      print(options.json ? { session: active } : active, options.json);
    },
  );
session
  .command('show')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(async (options: { path: string; json?: boolean }) => {
    const active = await new MemoryCatalog(options.path).readSession();
    print(
      options.json ? { session: active ?? null } : (active ?? 'No active session.'),
      options.json,
    );
  });
session
  .command('clear')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(async (options: { path: string; json?: boolean }) => {
    await new WorkflowHarness(options.path).clearSession();
    print(options.json ? { cleared: true } : 'Cleared the active session.', options.json);
  });

const add = program.command('add').description('Add curated optional assets to this project');
add
  .command('skill [name]')
  .description('Select and project a bundled optional Skill')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(async (name: string | undefined, options: { path: string; json?: boolean }) => {
    const root = path.resolve(options.path);
    const config = await readProjectConfig(root);
    const available = await listBundledOptionalSkills();
    const selected =
      name ??
      (options.json
        ? undefined
        : await select({
            message: 'Optional Skill to add',
            choices: available.map((skill) => ({ name: skill, value: skill })),
          }));
    if (!selected) {
      throw new Error('skill name is required with --json');
    }
    if (!available.includes(selected)) {
      throw new Error(
        `unknown bundled optional Skill: ${selected}; available: ${available.join(', ')}`,
      );
    }
    const optionalSkills = normalizeOptionalSkills([...config.optional_skills, selected]);
    await applyManagedRuntime(root, { optionalSkills });
    print(
      options.json
        ? { added: selected, optionalSkills }
        : `Added optional Skill ${selected}. Invoke it explicitly with \`$${selected}\` or let the host select it from its description.`,
      options.json,
    );
  });

const review = program.command('review').description('Record validated two-axis change reviews');
review
  .command('record <change>')
  .addOption(
    new Option('--standards <status>')
      .choices(['pass', 'pass_with_warnings', 'blocked'])
      .makeOptionMandatory(),
  )
  .addOption(
    new Option('--spec <status>')
      .choices(['pass', 'pass_with_warnings', 'blocked'])
      .makeOptionMandatory(),
  )
  .requiredOption('--body-file <path>', 'Markdown review body to record')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(
    async (
      changeId: string,
      options: {
        standards: ReviewAxisStatus;
        spec: ReviewAxisStatus;
        bodyFile: string;
        path: string;
        json?: boolean;
      },
    ) => {
      const body = await readFile(path.resolve(options.bodyFile), 'utf8');
      const result = await new WorkflowHarness(options.path).recordReview(changeId, {
        standards: options.standards,
        spec: options.spec,
        body,
      });
      print(result, options.json);
    },
  );

const context = program
  .command('context')
  .description('Curate repository-backed context references for task work and review');
context
  .command('add <change> <task>')
  .addOption(new Option('--purpose <purpose>').choices(['work', 'review']).makeOptionMandatory())
  .requiredOption('--file <path>', 'Repository-relative SpecPilot artifact path')
  .requiredOption('--reason <reason>', 'Why this context is required')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(
    async (
      changeId: string,
      taskId: string,
      options: {
        purpose: ContextPurpose;
        file: string;
        reason: string;
        path: string;
        json?: boolean;
      },
    ) => {
      const manifest = await new ProjectStore(options.path).addTaskContext(
        changeId,
        taskId,
        options.purpose,
        { path: options.file, reason: options.reason },
      );
      print(manifest, options.json);
    },
  );
context
  .command('list <change> <task>')
  .addOption(new Option('--purpose <purpose>').choices(['work', 'review']).makeOptionMandatory())
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(
    async (
      changeId: string,
      taskId: string,
      options: { purpose: ContextPurpose; path: string; json?: boolean },
    ) => {
      const listing = await new MemoryCatalog(options.path).contextFor(
        changeId,
        taskId,
        options.purpose,
      );
      print(listing, options.json);
      if (listing.missing.length > 0) process.exitCode = 1;
    },
  );
context
  .command('remove <change> <task>')
  .addOption(new Option('--purpose <purpose>').choices(['work', 'review']).makeOptionMandatory())
  .requiredOption('--file <path>', 'Repository-relative SpecPilot artifact path')
  .option('--path <path>', 'Project path', '.')
  .option('--json')
  .action(
    async (
      changeId: string,
      taskId: string,
      options: { purpose: ContextPurpose; file: string; path: string; json?: boolean },
    ) => {
      const manifest = await new ProjectStore(options.path).removeTaskContext(
        changeId,
        taskId,
        options.purpose,
        options.file,
      );
      print(manifest, options.json);
    },
  );
const contextInjection = context
  .command('injection')
  .description('Enable or disable lightweight per-turn workflow-state injection');

function registerContextInjection(mode: 'enable' | 'disable'): void {
  contextInjection
    .command(mode)
    .option('--path <path>', 'Project path', '.')
    .option('--json')
    .action(async (options: { path: string; json?: boolean }) => {
      const root = path.resolve(options.path);
      const enabled = mode === 'enable';
      await applyManagedRuntime(root, { perTurnState: enabled });
      print(
        options.json
          ? { enabled }
          : `Per-turn workflow-state injection ${enabled ? 'enabled' : 'disabled'}.`,
        options.json,
      );
    });
}

registerContextInjection('enable');
registerContextInjection('disable');

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
    await applyManagedRuntime(root);
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
  .command('prompt-context')
  .description('Emit lightweight per-turn state using the host hook protocol')
  .action(async () => {
    const input = await readHookInput();
    const workingDirectory = typeof input.cwd === 'string' ? input.cwd : '.';
    const root = (await findProjectRoot(workingDirectory)) ?? workingDirectory;
    // A hook failure would silently break every turn's injection, so contract
    // or IO errors degrade to a visible note instead of a non-zero exit.
    let additionalContext: string;
    try {
      additionalContext = promptContextText(await new WorkflowHarness(root).currentState());
    } catch (error) {
      additionalContext = `<specpilot-state>\nState unavailable: ${(error as Error).message}\nRun \`specpilot doctor\` to diagnose.\n</specpilot-state>`;
    }
    print(
      {
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext,
        },
      },
      true,
    );
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
