import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';

const execFileAsync = promisify(execFile);
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cliPath = path.join(repositoryRoot, 'dist', 'cli', 'index.js');

interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runCli(
  cwd: string,
  args: string[],
  input?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function setupRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'specpilot-cli-e2e-'));
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root });
  await writeFile(path.join(root, 'app.ts'), 'export const value = 1;\n');
  await execFileAsync('git', ['add', 'app.ts'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: root });
  return root;
}

beforeAll(async () => {
  await execFileAsync(process.execPath, ['build.js'], { cwd: repositoryRoot });
}, 30_000);

describe('SpecPilot public workflow CLI', () => {
  it('refuses sudo invocation before writing root-owned repository files', async () => {
    const root = await setupRepository();

    const result = await runCli(
      root,
      ['init', '.', '--host', 'codex', '--graph', 'none', '--yes', '--json'],
      undefined,
      { ...process.env, SUDO_UID: '501', SUDO_USER: 'test-user' },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Do not run SpecPilot with sudo');
    expect(result.stderr).toContain('restore ownership');
    await expect(readFile(path.join(root, '.specpilot', 'config.json'))).rejects.toThrow();
    await expect(
      readFile(path.join(root, '.agents', 'skills', 'specpilot-start', 'SKILL.md')),
    ).rejects.toThrow();
  });

  it('does not install CodeGraph from inside project initialization', async () => {
    const root = await setupRepository();
    const fakeBin = await mkdtemp(path.join(tmpdir(), 'specpilot-cli-path-'));
    const npmMarker = path.join(fakeBin, 'npm-invoked');
    await writeFile(
      path.join(fakeBin, 'npm'),
      `#!/bin/sh\nprintf invoked > "${npmMarker}"\nexit 9\n`,
      { mode: 0o755 },
    );

    const result = await runCli(
      root,
      ['init', '.', '--host', 'codex', '--graph', 'codegraph', '--yes', '--json'],
      undefined,
      { ...process.env, PATH: fakeBin },
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).warnings).toContain(
      'CodeGraph is unavailable. Install it separately with ' +
        '`npm install --global @colbymchenry/codegraph` (use sudo only for that system ' +
        'installation if required), then rerun this init command. Source search fallback ' +
        'remains available.',
    );
    await expect(readFile(npmMarker)).rejects.toThrow();
  });

  it('runs start through finish and clears the active session', async () => {
    const root = await setupRepository();
    const successCommand = [process.execPath, '-e', 'process.exit(0)'];

    for (const args of [
      ['init', '.', '--host', 'codex', '--graph', 'none', '--context-injection', '--yes', '--json'],
      ['change', 'new', 'add-value', '--title', 'Add value', '--kind', 'light', '--json'],
      ['task', 'add', 'add-value', 'implement', '--title', 'Implement value', '--json'],
      ['change', 'approve', 'add-value', '--json'],
      ['task', 'start', 'add-value', 'implement', '--json'],
    ]) {
      expect(await runCli(root, args)).toMatchObject({ exitCode: 0 });
    }

    const knowledgeAudit = await runCli(root, ['knowledge', 'audit', '.', '--json']);
    expect(knowledgeAudit.exitCode).toBe(0);
    expect(JSON.parse(knowledgeAudit.stdout)).toMatchObject({
      policy_version: 2,
      healthy: true,
      coverage: expect.arrayContaining([
        expect.objectContaining({ id: 'architecture-boundaries', priority: 'p0' }),
      ]),
    });
    expect(await runCli(root, ['context', 'budget', 'set', '65536', '--json'])).toMatchObject({
      exitCode: 0,
    });
    expect(
      await runCli(root, ['context', 'budget', 'set', '8192', '--purpose', 'work', '--json']),
    ).toMatchObject({ exitCode: 0 });
    const budget = await runCli(root, ['context', 'budget', 'show', '--json']);
    expect(JSON.parse(budget.stdout)).toEqual({ max_bytes: 65_536, work_bytes: 8_192 });
    await writeFile(
      path.join(root, 'specs', 'project', 'examples', 'add-value.md'),
      '# Add value implementation example\n\nUse this approved pattern when implementing value changes.\n',
    );
    const suggestions = await runCli(root, [
      'context',
      'suggest',
      'add-value',
      'implement',
      '--purpose',
      'work',
      '--apply',
      '--json',
    ]);
    expect(suggestions.exitCode).toBe(0);
    expect(JSON.parse(suggestions.stdout)).toMatchObject({
      budgetBytes: 8_192,
      selected: expect.any(Array),
      omitted: expect.any(Array),
      applied: expect.arrayContaining(['specs/project/examples/add-value.md']),
    });

    await expect(
      readFile(path.join(root, '.agents', 'skills', 'codebase-design', 'SKILL.md')),
    ).rejects.toThrow();
    const addedSkill = await runCli(root, ['add', 'skill', 'codebase-design', '--json']);
    expect(addedSkill.exitCode).toBe(0);
    expect(JSON.parse(addedSkill.stdout)).toEqual({
      added: 'codebase-design',
      optionalSkills: ['codebase-design'],
    });
    expect(
      JSON.parse(await readFile(path.join(root, '.specpilot', 'config.json'), 'utf8')),
    ).toMatchObject({
      optional_skills: ['codebase-design'],
    });
    expect(
      await readFile(path.join(root, '.agents', 'skills', 'codebase-design', 'SKILL.md'), 'utf8'),
    ).toContain('Design **deep modules**');
    const addedDomainModeling = await runCli(root, ['add', 'skill', 'domain-modeling', '--json']);
    expect(addedDomainModeling.exitCode).toBe(0);
    expect(JSON.parse(addedDomainModeling.stdout)).toEqual({
      added: 'domain-modeling',
      optionalSkills: ['codebase-design', 'domain-modeling'],
    });
    expect(
      JSON.parse(await readFile(path.join(root, '.specpilot', 'config.json'), 'utf8')),
    ).toMatchObject({
      optional_skills: ['codebase-design', 'domain-modeling'],
    });
    expect(
      await readFile(path.join(root, '.agents', 'skills', 'domain-modeling', 'SKILL.md'), 'utf8'),
    ).toContain('specs/project/glossary.md');

    const active = await runCli(root, ['session', 'show', '--json']);
    expect(active.exitCode).toBe(0);
    expect(JSON.parse(active.stdout)).toMatchObject({
      session: { active_change: 'add-value', active_task: 'implement' },
    });
    expect(await readFile(path.join(root, '.codex', 'hooks.json'), 'utf8')).toContain(
      'specpilot internal prompt-context',
    );

    expect(
      await runCli(root, [
        'context',
        'add',
        'add-value',
        'implement',
        '--purpose',
        'work',
        '--file',
        'specs/project/standards/README.md',
        '--reason',
        'Project standards',
        '--json',
      ]),
    ).toMatchObject({ exitCode: 0 });
    const context = await runCli(root, [
      'context',
      'list',
      'add-value',
      'implement',
      '--purpose',
      'work',
      '--json',
    ]);
    expect(context.exitCode).toBe(0);
    expect(JSON.parse(context.stdout)).toMatchObject({
      purpose: 'work',
      references: expect.arrayContaining([
        {
          path: 'specs/project/standards/README.md',
          reason: 'Project standards',
          exists: true,
          trusted: true,
        },
      ]),
      missing: [],
    });
    expect(
      await runCli(root, [
        'context',
        'remove',
        'add-value',
        'implement',
        '--purpose',
        'work',
        '--file',
        'specs/project/standards/README.md',
        '--json',
      ]),
    ).toMatchObject({ exitCode: 0 });
    expect(
      await runCli(root, [
        'context',
        'add',
        'add-value',
        'implement',
        '--purpose',
        'work',
        '--file',
        'specs/project/standards/README.md',
        '--reason',
        'Project standards',
        '--json',
      ]),
    ).toMatchObject({ exitCode: 0 });

    const nestedWorkingDirectory = path.join(root, 'packages', 'feature');
    await mkdir(nestedWorkingDirectory, { recursive: true });
    const hook = await runCli(
      root,
      ['internal', 'prompt-context'],
      JSON.stringify({ cwd: nestedWorkingDirectory }),
    );
    expect(hook.exitCode).toBe(0);
    expect(JSON.parse(hook.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: expect.stringContaining('Active: add-value/implement'),
      },
    });
    expect(JSON.parse(hook.stdout).hookSpecificOutput.additionalContext).toContain(
      'Context(work): 3 references; missing 0',
    );
    expect(await runCli(root, ['context', 'injection', 'disable', '--json'])).toMatchObject({
      exitCode: 0,
    });
    await expect(readFile(path.join(root, '.codex', 'hooks.json'))).rejects.toThrow();
    expect(await runCli(root, ['context', 'injection', 'enable', '--json'])).toMatchObject({
      exitCode: 0,
    });
    expect(await readFile(path.join(root, '.codex', 'hooks.json'), 'utf8')).toContain(
      'specpilot internal prompt-context',
    );
    expect(await runCli(root, ['update', '.', '--json'])).toMatchObject({ exitCode: 0 });
    expect(
      JSON.parse(await readFile(path.join(root, '.specpilot', 'config.json'), 'utf8')),
    ).toMatchObject({ context: { max_bytes: 65_536, work_bytes: 8_192 } });
    expect(
      await readFile(path.join(root, '.agents', 'skills', 'codebase-design', 'SKILL.md'), 'utf8'),
    ).toContain('Design **deep modules**');
    expect(
      await readFile(path.join(root, '.agents', 'skills', 'domain-modeling', 'SKILL.md'), 'utf8'),
    ).toContain('specs/project/glossary.md');

    const unproven = await runCli(root, ['task', 'complete', 'add-value', 'implement', '--json']);
    expect(unproven.exitCode).toBe(1);
    expect(unproven.stderr).toContain('requires fresh green evidence');

    expect(
      await runCli(root, [
        'verify',
        'run',
        '--change',
        'add-value',
        '--task',
        'implement',
        '--phase',
        'green',
        '--json',
        '--',
        ...successCommand,
      ]),
    ).toMatchObject({ exitCode: 0 });
    expect(
      await runCli(root, ['task', 'complete', 'add-value', 'implement', '--json']),
    ).toMatchObject({ exitCode: 0 });

    const reviewDraft = path.join(root, '.specpilot', 'local', 'review-draft.md');
    await mkdir(path.dirname(reviewDraft), { recursive: true });
    await writeFile(reviewDraft, '# Review\n\nNo findings.\n');
    expect(
      await runCli(root, [
        'review',
        'record',
        'add-value',
        '--standards',
        'pass',
        '--spec',
        'pass',
        '--body-file',
        reviewDraft,
        '--json',
      ]),
    ).toMatchObject({ exitCode: 0 });

    expect(
      await runCli(root, [
        'verify',
        'run',
        '--change',
        'add-value',
        '--task',
        'implement',
        '--phase',
        'final',
        '--json',
        '--',
        ...successCommand,
      ]),
    ).toMatchObject({ exitCode: 0 });

    const preview = await runCli(root, ['internal', 'finish', '--change', 'add-value', '--json']);
    expect(preview.exitCode).toBe(0);
    expect(JSON.parse(preview.stdout)).toMatchObject({ status: 'ready' });
    expect(
      await runCli(root, ['internal', 'finish', '--change', 'add-value', '--apply', '--json']),
    ).toMatchObject({ exitCode: 0 });

    const change = YAML.parse(
      await readFile(path.join(root, 'specs', 'changes', 'add-value', 'change.yaml'), 'utf8'),
    );
    expect(change.status).toBe('closed');
    const cleared = await runCli(root, ['session', 'show', '--json']);
    expect(cleared.exitCode).toBe(0);
    expect(JSON.parse(cleared.stdout)).toEqual({ session: null });
  });

  it('records reviewer findings with attribution and enforces the blocking floor', async () => {
    const root = await setupRepository();
    const successCommand = [process.execPath, '-e', 'process.exit(0)'];

    for (const args of [
      ['init', '.', '--host', 'codex', '--graph', 'none', '--yes', '--json'],
      ['change', 'new', 'add-value', '--title', 'Add value', '--kind', 'light', '--json'],
      ['task', 'add', 'add-value', 'implement', '--title', 'Implement value', '--json'],
      ['change', 'approve', 'add-value', '--json'],
      ['task', 'start', 'add-value', 'implement', '--json'],
      [
        'verify',
        'run',
        '--change',
        'add-value',
        '--task',
        'implement',
        '--phase',
        'green',
        '--json',
        '--',
        ...successCommand,
      ],
      ['task', 'complete', 'add-value', 'implement', '--json'],
    ]) {
      expect(await runCli(root, args)).toMatchObject({ exitCode: 0 });
    }

    const findingsDirectory = path.join(root, '.specpilot', 'local', 'review-findings');
    await mkdir(findingsDirectory, { recursive: true });
    await writeFile(
      path.join(findingsDirectory, 'standards-reviewer.json'),
      JSON.stringify({
        schema_version: 1,
        reviewer: 'standards-reviewer',
        axis: 'standards',
        status: 'blocked',
        findings: [
          {
            severity: 'blocking',
            title: 'Mysterious name in the new module',
            evidence: [{ path: 'app.ts', lines: '1' }],
            recommendation: 'Rename the export to reveal its purpose.',
          },
        ],
      }),
    );
    const reviewDraft = path.join(root, '.specpilot', 'local', 'review-draft.md');
    await writeFile(reviewDraft, '# Review\n\nSee structured findings.\n');

    const rejected = await runCli(root, [
      'review',
      'record',
      'add-value',
      '--standards',
      'pass',
      '--spec',
      'pass',
      '--body-file',
      reviewDraft,
      '--findings',
      'standards-reviewer.json',
      '--json',
    ]);
    expect(rejected.exitCode).toBe(1);
    expect(rejected.stderr).toContain('standards findings contain blocking findings');

    const recorded = await runCli(root, [
      'review',
      'record',
      'add-value',
      '--standards',
      'blocked',
      '--spec',
      'pass',
      '--body-file',
      reviewDraft,
      '--findings',
      'standards-reviewer.json',
      '--json',
    ]);
    expect(recorded.exitCode).toBe(0);
    expect(JSON.parse(recorded.stdout)).toMatchObject({
      status: 'blocked',
      reviewers: [
        {
          id: 'standards-reviewer',
          axis: 'standards',
          findings_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        },
      ],
    });
    const reviewMarkdown = await readFile(
      path.join(root, 'specs', 'changes', 'add-value', 'review.md'),
      'utf8',
    );
    expect(reviewMarkdown).toContain('## Standards findings (reviewer: standards-reviewer)');
    expect(reviewMarkdown).toContain('**blocking** Mysterious name in the new module (app.ts:1)');
  });

  it('emits self-contained subagent briefings in markdown and JSON', async () => {
    const root = await setupRepository();

    for (const args of [
      ['init', '.', '--host', 'codex', '--graph', 'none', '--yes', '--json'],
      ['change', 'new', 'add-value', '--title', 'Add value', '--kind', 'light', '--json'],
      ['task', 'add', 'add-value', 'implement', '--title', 'Implement value', '--json'],
      ['change', 'approve', 'add-value', '--json'],
    ]) {
      expect(await runCli(root, args)).toMatchObject({ exitCode: 0 });
    }

    const markdown = await runCli(root, [
      'internal',
      'briefing',
      'add-value',
      'implement',
      '--purpose',
      'work',
    ]);
    expect(markdown.exitCode).toBe(0);
    expect(markdown.stdout).toContain('# SpecPilot briefing: add-value / implement (work)');
    expect(markdown.stdout).toContain('specs/changes/add-value/spec.md');
    expect(markdown.stdout).toContain(
      'specpilot verify run --change add-value --task implement --phase green',
    );

    const json = await runCli(root, [
      'internal',
      'briefing',
      'add-value',
      'implement',
      '--purpose',
      'review',
      '--format',
      'json',
    ]);
    expect(json.exitCode).toBe(0);
    expect(JSON.parse(json.stdout)).toMatchObject({
      change: { id: 'add-value', specApproved: true },
      task: { id: 'implement', execution: 'standard' },
      purpose: 'review',
    });

    const unknown = await runCli(root, [
      'internal',
      'briefing',
      'add-value',
      'missing-task',
      '--purpose',
      'work',
    ]);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toContain('task missing-task does not exist');
  });
});
