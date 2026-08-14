import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { EvidenceRunner } from '../../src/evidence/evidence-runner.js';
import { MemoryCatalog } from '../../src/memory/memory-catalog.js';
import { ProjectStore } from '../../src/project/project-store.js';
import { WorkflowHarness } from '../../src/workflow/workflow-harness.js';

const execFileAsync = promisify(execFile);

const PASS = [process.execPath, '-e', 'process.exit(0)'];
const FAIL = [process.execPath, '-e', 'process.exit(1)'];
const CHECK_IMPL = [
  process.execPath,
  '-e',
  "process.exit(require('node:fs').existsSync('impl.txt') ? 0 : 1)",
];

async function setupRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'specpilot-workflow-'));
  await execFileAsync('git', ['init'], { cwd: root });
  await execFileAsync('git', ['config', 'user.email', 'test@example.com'], { cwd: root });
  await execFileAsync('git', ['config', 'user.name', 'Test'], { cwd: root });
  await writeFile(path.join(root, 'app.ts'), 'export const value = 1;\n');
  await execFileAsync('git', ['add', 'app.ts'], { cwd: root });
  await execFileAsync('git', ['commit', '-m', 'initial'], { cwd: root });
  return root;
}

async function writeChange(
  root: string,
  options: {
    specApproved?: boolean;
    execution?: 'standard' | 'tdd';
    taskStatus?: 'todo' | 'doing' | 'done' | 'blocked' | 'waived';
    blockedBy?: string[];
  } = {},
): Promise<string> {
  const changeDirectory = path.join(root, 'specs', 'changes', 'add-value');
  await mkdir(path.join(changeDirectory, 'tasks'), { recursive: true });
  const change: Record<string, unknown> = {
    schema_version: 1,
    id: 'add-value',
    title: 'Add value',
    kind: 'light',
    status: 'open',
    created_at: '2026-07-29T00:00:00.000Z',
  };
  if (options.specApproved !== false) {
    change.spec_approved_at = '2026-07-29T00:01:00.000Z';
  }
  await writeFile(path.join(changeDirectory, 'change.yaml'), YAML.stringify(change));
  await writeFile(path.join(changeDirectory, 'spec.md'), '# Add value\n');
  await writeFile(
    path.join(changeDirectory, 'tasks', 'implement.md'),
    `---
schema_version: 1
id: implement
title: Implement the value
status: ${options.taskStatus ?? 'done'}
blocked_by: ${JSON.stringify(options.blockedBy ?? [])}
execution: ${options.execution ?? 'tdd'}
---
# Implement
`,
  );
  return changeDirectory;
}

async function writeReview(
  changeDirectory: string,
  fingerprint: string,
  specFingerprint?: string,
): Promise<void> {
  const root = path.resolve(changeDirectory, '..', '..', '..');
  const changeId = path.basename(changeDirectory);
  const reviewContextFingerprint = (
    await new MemoryCatalog(root).changeContextSnapshot(changeId, 'review')
  ).fingerprint;
  await writeFile(
    path.join(changeDirectory, 'review.md'),
    `---
schema_version: 1
status: pass
standards: pass
spec: pass
reviewed_at: 2026-07-29T00:02:00.000Z
worktree_fingerprint: ${fingerprint}
spec_fingerprint: ${specFingerprint ?? (await new ProjectStore(root).specFingerprint(changeId))}
review_context_fingerprint: ${reviewContextFingerprint}
---
# Review
`,
  );
}

async function writeContextBudget(root: string, maxBytes: number): Promise<void> {
  await mkdir(path.join(root, '.specpilot'), { recursive: true });
  await writeFile(
    path.join(root, '.specpilot', 'config.json'),
    JSON.stringify({
      schema_version: 1,
      managed_version: 'test',
      language: 'en',
      hosts: ['codex'],
      graph: { provider: 'none', required: false },
      context: { per_turn_state: false, max_bytes: maxBytes },
      optional_skills: [],
    }),
  );
}

describe('WorkflowHarness task lifecycle', () => {
  it('returns a lightweight active workflow state without running finish gates', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard', taskStatus: 'todo' });
    const harness = new WorkflowHarness(root);

    await expect(harness.currentState()).resolves.toEqual({
      active: null,
      next: 'specpilot-start',
    });
    await harness.transitionTask('add-value', 'implement', 'start');
    await expect(harness.currentState()).resolves.toMatchObject({
      active: {
        change: 'add-value',
        task: 'implement',
        changeStatus: 'open',
        taskStatus: 'doing',
        stale: false,
      },
      next: 'specpilot-work',
      context: {
        purpose: 'work',
        count: 1,
        missing: [],
      },
    });
  });

  it('activates a started task and requires fresh green evidence before completion', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard', taskStatus: 'todo' });
    const harness = new WorkflowHarness(root);

    await expect(harness.transitionTask('add-value', 'implement', 'start')).resolves.toMatchObject({
      status: 'doing',
    });
    await expect(new MemoryCatalog(root).readSession()).resolves.toMatchObject({
      active_change: 'add-value',
      active_task: 'implement',
    });
    await expect(harness.transitionTask('add-value', 'implement', 'complete')).rejects.toThrow(
      'task implement requires fresh green evidence before completion',
    );

    const green = await new EvidenceRunner(root).run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'green',
      command: PASS,
    });
    expect(green).toMatchObject({ context_scope: 'work' });
    expect(green.context_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      harness.transitionTask('add-value', 'implement', 'complete'),
    ).resolves.toMatchObject({ status: 'done' });
  });

  it('requires new green evidence when curated work context changes', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard', taskStatus: 'todo' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'testing.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Testing\n\nRun the focused suite.\n');
    await new ProjectStore(root).addTaskContext('add-value', 'implement', 'work', {
      path: 'specs/project/standards/testing.md',
      reason: 'Required testing standard.',
    });
    const harness = new WorkflowHarness(root);
    await harness.transitionTask('add-value', 'implement', 'start');
    await new EvidenceRunner(root).run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'green',
      command: PASS,
    });

    await writeFile(standard, '# Testing\n\nRun the expanded suite.\n');
    await expect(harness.transitionTask('add-value', 'implement', 'complete')).rejects.toThrow(
      'task implement requires green evidence for the current work context',
    );
  });

  it('rejects green evidence copied from another change', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard', taskStatus: 'todo' });
    const harness = new WorkflowHarness(root);
    await harness.transitionTask('add-value', 'implement', 'start');

    const store = new ProjectStore(root);
    await store.createChange({ id: 'other-change', title: 'Other change', kind: 'light' });
    await store.addTask('other-change', { id: 'implement', title: 'Implement other change' });
    const foreign = await new EvidenceRunner(root).run({
      changeId: 'other-change',
      taskId: 'implement',
      phase: 'green',
      command: PASS,
    });
    const target = path.join(root, '.specpilot', 'evidence', 'add-value', 'implement');
    await mkdir(target, { recursive: true });
    await writeFile(path.join(target, `${foreign.id}.json`), JSON.stringify(foreign));

    await expect(harness.transitionTask('add-value', 'implement', 'complete')).rejects.toThrow(
      'task implement requires fresh green evidence before completion',
    );
  });

  it('refuses to start a task whose dependencies are not complete', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, {
      execution: 'standard',
      taskStatus: 'todo',
      blockedBy: ['prepare'],
    });
    await writeFile(
      path.join(changeDirectory, 'tasks', 'prepare.md'),
      `---
schema_version: 1
id: prepare
title: Prepare the contract
status: todo
blocked_by: []
execution: standard
---
# Prepare
`,
    );

    await expect(
      new WorkflowHarness(root).transitionTask('add-value', 'implement', 'start'),
    ).rejects.toThrow('task implement has unsatisfied dependencies: prepare');
  });

  it('refuses to start a task whose curated work context is missing', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard', taskStatus: 'todo' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'testing.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Testing\n');
    await new ProjectStore(root).addTaskContext('add-value', 'implement', 'work', {
      path: 'specs/project/standards/testing.md',
      reason: 'Required testing standard.',
    });
    await rm(standard);

    await expect(
      new WorkflowHarness(root).transitionTask('add-value', 'implement', 'start'),
    ).rejects.toThrow(
      'task implement has missing work context: specs/project/standards/testing.md',
    );
  });

  it('enforces context trust and byte budgets at start, review, and finish gates', async () => {
    const oversizedRoot = await setupRepository();
    const oversizedChange = await writeChange(oversizedRoot, {
      execution: 'standard',
      taskStatus: 'todo',
    });
    await writeFile(path.join(oversizedChange, 'spec.md'), `# Add value\n\n${'x'.repeat(5_000)}\n`);
    await writeContextBudget(oversizedRoot, 4_096);
    await expect(
      new WorkflowHarness(oversizedRoot).transitionTask('add-value', 'implement', 'start'),
    ).rejects.toThrow('work context exceeds its 4096-byte budget');

    const untrustedRoot = await setupRepository();
    await writeChange(untrustedRoot, { execution: 'standard', taskStatus: 'todo' });
    const untrustedPath = path.join(untrustedRoot, 'specs', 'knowledge', 'invalid.md');
    await mkdir(path.dirname(untrustedPath), { recursive: true });
    await writeFile(untrustedPath, '# Bypassed review and provenance\n');
    const untrustedStore = new ProjectStore(untrustedRoot);
    await untrustedStore.addTaskContext('add-value', 'implement', 'work', {
      path: 'specs/knowledge/invalid.md',
      reason: 'This must be rejected as untrusted.',
    });
    await expect(
      new WorkflowHarness(untrustedRoot).transitionTask('add-value', 'implement', 'start'),
    ).rejects.toThrow('untrusted work context: specs/knowledge/invalid.md');
    await untrustedStore.addTaskContext('add-value', 'implement', 'review', {
      path: 'specs/knowledge/invalid.md',
      reason: 'This must also be rejected during review.',
    });
    await expect(
      new WorkflowHarness(untrustedRoot).recordReview('add-value', {
        standards: 'blocked',
        spec: 'pass',
        body: '# Blocked review\n',
      }),
    ).rejects.toThrow('untrusted review context: specs/knowledge/invalid.md');
    await expect(new WorkflowHarness(untrustedRoot).finish('add-value')).resolves.toMatchObject({
      status: 'blocked',
      missing: expect.arrayContaining([
        'task implement has untrusted work context: specs/knowledge/invalid.md',
      ]),
    });

    const reviewRoot = await setupRepository();
    await writeChange(reviewRoot, { execution: 'standard', taskStatus: 'done' });
    const reviewStandard = path.join(reviewRoot, 'specs', 'project', 'standards', 'review.md');
    await mkdir(path.dirname(reviewStandard), { recursive: true });
    await writeFile(reviewStandard, `# Review\n\n${'x'.repeat(5_000)}\n`);
    await new ProjectStore(reviewRoot).addTaskContext('add-value', 'implement', 'review', {
      path: 'specs/project/standards/review.md',
      reason: 'Large required review policy.',
    });
    await writeContextBudget(reviewRoot, 4_096);
    const reviewHarness = new WorkflowHarness(reviewRoot);
    await expect(
      reviewHarness.recordReview('add-value', {
        standards: 'pass',
        spec: 'pass',
        body: '# Review\n',
      }),
    ).rejects.toThrow('review context exceeds its 4096-byte budget');
    await expect(reviewHarness.finish('add-value')).resolves.toMatchObject({
      status: 'blocked',
      missing: expect.arrayContaining([
        expect.stringContaining('review context exceeds its 4096-byte budget'),
      ]),
    });
  });

  it('validates, activates, and clears a local session pointer', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard', taskStatus: 'todo' });
    const harness = new WorkflowHarness(root);

    await expect(harness.activateSession('add-value', 'implement')).resolves.toMatchObject({
      active_change: 'add-value',
      active_task: 'implement',
    });
    await expect(harness.activateSession('add-value', 'missing')).rejects.toThrow(
      'task missing does not exist in change add-value',
    );
    await harness.clearSession();
    await expect(new MemoryCatalog(root).readSession()).resolves.toBeUndefined();
  });
});

describe('WorkflowHarness finish gate', () => {
  it('closes a TDD change whose implementation landed between red and green evidence', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root);
    const evidence = new EvidenceRunner(root);
    const harness = new WorkflowHarness(root);

    const unproven = await harness.finish('add-value');
    expect(unproven.status).toBe('blocked');
    expect(unproven.missing).toContain('task implement is missing red evidence');

    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'red',
      reason: 'impl.txt does not exist until the task is implemented.',
      command: CHECK_IMPL,
    });
    // The implementation changes the worktree after red evidence was recorded.
    await writeFile(path.join(root, 'impl.txt'), 'implemented\n');
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'green',
      command: CHECK_IMPL,
    });
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });

    const unreviewed = await harness.finish('add-value');
    expect(unreviewed.status).toBe('blocked');
    expect(unreviewed.missing).toContain('review.md is missing');

    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);
    const candidate = path.join(root, '.specpilot', 'local', 'knowledge-candidates', 'lesson.md');
    await mkdir(path.dirname(candidate), { recursive: true });
    await writeFile(candidate, '# Lesson\n');
    const closed = await harness.finish('add-value', { apply: true });
    expect(closed.status).toBe('closed');
    expect(closed.missing).toEqual([]);
    expect(closed.knowledgeCandidates).toEqual(['.specpilot/local/knowledge-candidates/lesson.md']);

    const change = YAML.parse(await readFile(path.join(changeDirectory, 'change.yaml'), 'utf8'));
    expect(change.status).toBe('closed');
    expect(change).not.toHaveProperty('phase');
    const summary = await readFile(path.join(changeDirectory, 'summary.md'), 'utf8');
    expect(summary).toContain('# Change Summary');
    expect(summary).toContain('- Review: passed');
    expect(summary).toContain('.specpilot/local/knowledge-candidates/lesson.md');
  });

  it('blocks when the review fingerprint no longer matches the worktree', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, { execution: 'standard' });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeReview(changeDirectory, 'stale-fingerprint');

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain('review is stale: the worktree changed after review');
  });

  it('blocks when the spec documents change after the review', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, { execution: 'standard' });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);

    // Editing spec.md is invisible to the worktree fingerprint (specs/** is
    // excluded), so the spec fingerprint must catch it on its own.
    await writeFile(
      path.join(changeDirectory, 'spec.md'),
      '# Spec: Add value\n\n## Acceptance criteria\n\nWeakened after review.\n',
    );
    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain('review is stale: the spec documents changed after review');
  });

  it('blocks a review that predates spec fingerprinting', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, { execution: 'standard' });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    const { fingerprint } = await evidence.fingerprint();
    await writeFile(
      path.join(changeDirectory, 'review.md'),
      `---
schema_version: 1
status: pass
standards: pass
spec: pass
reviewed_at: 2026-07-29T00:02:00.000Z
worktree_fingerprint: ${fingerprint}
---
# Review
`,
    );

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain('review is stale: the spec documents changed after review');
  });

  it('blocks a review without a worktree fingerprint', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, { execution: 'standard' });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeFile(
      path.join(changeDirectory, 'review.md'),
      `---
schema_version: 1
status: pass
standards: pass
spec: pass
reviewed_at: 2026-07-29T00:02:00.000Z
---
# Review
`,
    );

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing.some((item) => item.includes('worktree_fingerprint'))).toBe(true);
  });

  it('blocks finish when curated context disappears after review', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, { execution: 'standard' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'review.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Review standard\n');
    await new ProjectStore(root).addTaskContext('add-value', 'implement', 'review', {
      path: 'specs/project/standards/review.md',
      reason: 'Required review standard.',
    });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);
    await rm(standard);

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain(
      'task implement has missing review context: specs/project/standards/review.md',
    );
  });

  it('blocks finish when review context changes after the review', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, { execution: 'standard' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'review.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Review standard\n\nCheck public compatibility.\n');
    await new ProjectStore(root).addTaskContext('add-value', 'implement', 'review', {
      path: 'specs/project/standards/review.md',
      reason: 'Required review standard.',
    });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);

    await writeFile(standard, '# Review standard\n\nCheck compatibility and rollback safety.\n');
    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain('review is stale: curated review context changed');
  });

  it('requires new final evidence when curated work context changes', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, { execution: 'standard' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'testing.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Testing\n\nRun the focused suite.\n');
    await new ProjectStore(root).addTaskContext('add-value', 'implement', 'work', {
      path: 'specs/project/standards/testing.md',
      reason: 'Required testing standard.',
    });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeFile(standard, '# Testing\n\nRun the expanded suite.\n');
    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain('change is missing fresh final evidence');
  });

  it('blocks when the spec has not been approved', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, {
      specApproved: false,
      execution: 'standard',
    });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain('change is missing spec_approved_at');
  });

  it('blocks when a standard task records green evidence after final evidence', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root, { execution: 'standard' });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'green',
      command: PASS,
    });
    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain(
      'final evidence must be recorded after task implement green evidence',
    );
  });

  it('blocks when red and green evidence use different commands', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root);
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'red',
      reason: 'The focused behavior is not implemented yet.',
      command: FAIL,
    });
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'green',
      command: PASS,
    });
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('blocked');
    expect(result.missing).toContain(
      'task implement red and green evidence must use the same command',
    );
  });

  it('keeps historical red evidence usable when work context changes before green', async () => {
    const root = await setupRepository();
    const changeDirectory = await writeChange(root);
    const standard = path.join(root, 'specs', 'project', 'standards', 'testing.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Testing\n\nUse the focused check.\n');
    await new ProjectStore(root).addTaskContext('add-value', 'implement', 'work', {
      path: 'specs/project/standards/testing.md',
      reason: 'Required testing standard.',
    });
    const evidence = new EvidenceRunner(root);
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'red',
      reason: 'The focused behavior is not implemented yet.',
      command: CHECK_IMPL,
    });
    await writeFile(standard, '# Testing\n\nUse the focused check and report coverage.\n');
    await writeFile(path.join(root, 'impl.txt'), 'implemented\n');
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'green',
      command: CHECK_IMPL,
    });
    await evidence.run({
      changeId: 'add-value',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    await writeReview(changeDirectory, (await evidence.fingerprint()).fingerprint);

    const result = await new WorkflowHarness(root).finish('add-value');
    expect(result.status).toBe('ready');
  });
});

describe('WorkflowHarness review recording', () => {
  it('refuses to record a review with missing curated review context', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'review.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Review standard\n');
    await new ProjectStore(root).addTaskContext('add-value', 'implement', 'review', {
      path: 'specs/project/standards/review.md',
      reason: 'Required review standard.',
    });
    await rm(standard);

    await expect(
      new WorkflowHarness(root).recordReview('add-value', {
        standards: 'pass',
        spec: 'pass',
        body: '# Review\n',
      }),
    ).rejects.toThrow(
      'task implement has missing review context: specs/project/standards/review.md',
    );
  });

  it('refuses to record even a blocking review when review context is missing', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard', taskStatus: 'doing' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'review.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Review standard\n');
    await new ProjectStore(root).addTaskContext('add-value', 'implement', 'review', {
      path: 'specs/project/standards/review.md',
      reason: 'Required review standard.',
    });
    await rm(standard);

    await expect(
      new WorkflowHarness(root).recordReview('add-value', {
        standards: 'blocked',
        spec: 'pass',
        body: '# Review\n\n- Blocking: naming drift in the new module.\n',
      }),
    ).rejects.toThrow(
      'task implement has missing review context: specs/project/standards/review.md',
    );
  });

  it('records a blocking review while tasks are unfinished but keeps the passing gate', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard', taskStatus: 'doing' });
    const harness = new WorkflowHarness(root);

    await expect(
      harness.recordReview('add-value', {
        standards: 'blocked',
        spec: 'pass',
        body: '# Review\n\n- Blocking: naming drift in the new module.\n',
      }),
    ).resolves.toMatchObject({ status: 'blocked' });

    await expect(
      harness.recordReview('add-value', {
        standards: 'pass',
        spec: 'pass',
        body: '# Review\n',
      }),
    ).rejects.toThrow('change add-value has unfinished tasks: implement');
  });

  it('derives the review status and records the current worktree fingerprint', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard' });
    const harness = new WorkflowHarness(root);

    const recorded = await harness.recordReview('add-value', {
      standards: 'pass_with_warnings',
      spec: 'pass',
      body: '# Review\n\n- Warning: keep the compatibility note visible.\n',
    });

    expect(recorded).toMatchObject({
      status: 'pass_with_warnings',
      standards: 'pass_with_warnings',
      spec: 'pass',
    });
    expect(recorded.worktreeFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(recorded.reviewContextFingerprint).toMatch(/^[a-f0-9]{64}$/);
    await expect(new ProjectStore(root).readReview('add-value')).resolves.toMatchObject({
      status: 'pass_with_warnings',
      body: expect.stringContaining('compatibility note'),
      worktreeFingerprint: recorded.worktreeFingerprint,
    });
  });
});

describe('WorkflowHarness review findings', () => {
  async function writeFindings(
    root: string,
    name: string,
    report: Record<string, unknown>,
  ): Promise<void> {
    const directory = path.join(root, '.specpilot', 'local', 'review-findings');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, name), JSON.stringify(report));
  }

  function standardsReport(findings: Record<string, unknown>[]): Record<string, unknown> {
    return {
      schema_version: 1,
      reviewer: 'standards-reviewer',
      axis: 'standards',
      status: findings.some((finding) => finding.severity === 'blocking')
        ? 'blocked'
        : 'pass_with_warnings',
      findings,
    };
  }

  it('rejects a passing axis when its findings contain a blocking finding', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard' });
    await writeFindings(
      root,
      'standards-reviewer.json',
      standardsReport([
        {
          severity: 'blocking',
          title: 'Feature envy in the new module',
          evidence: [{ path: 'app.ts', lines: '1' }],
        },
      ]),
    );

    await expect(
      new WorkflowHarness(root).recordReview('add-value', {
        standards: 'pass',
        spec: 'pass',
        body: '# Review\n',
        findings: ['standards-reviewer.json'],
      }),
    ).rejects.toThrow(/standards findings contain blocking findings/);
  });

  it('rejects pass on an axis whose findings contain warnings', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard' });
    await writeFindings(
      root,
      'standards-reviewer.json',
      standardsReport([{ severity: 'warning', title: 'Mysterious name', evidence: [] }]),
    );

    await expect(
      new WorkflowHarness(root).recordReview('add-value', {
        standards: 'pass',
        spec: 'pass',
        body: '# Review\n',
        findings: ['standards-reviewer.json'],
      }),
    ).rejects.toThrow(/standards findings contain warnings/);
  });

  it('merges findings into the review body with reviewer attribution', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard' });
    await writeFindings(
      root,
      'standards-reviewer.json',
      standardsReport([
        {
          severity: 'blocking',
          title: 'Feature envy in the new module',
          evidence: [{ path: 'app.ts', lines: '1' }],
          recommendation: 'Move the logic onto the data it uses.',
        },
      ]),
    );
    const harness = new WorkflowHarness(root);

    const recorded = await harness.recordReview('add-value', {
      standards: 'blocked',
      spec: 'pass',
      body: '# Review\n',
      findings: ['standards-reviewer.json'],
    });

    expect(recorded.status).toBe('blocked');
    expect(recorded.reviewers).toEqual([
      {
        id: 'standards-reviewer',
        axis: 'standards',
        findings_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);
    expect(recorded.body).toContain('## Standards findings (reviewer: standards-reviewer)');
    expect(recorded.body).toContain('**blocking** Feature envy in the new module (app.ts:1)');
    expect(recorded.body).toContain('Recommendation: Move the logic onto the data it uses.');
    const persisted = await new ProjectStore(root).readReview('add-value');
    expect(persisted.reviewers).toEqual(recorded.reviewers);
    expect(persisted.body).toBe(recorded.body);
  });

  it('records a clean review with attribution when findings reports are empty', async () => {
    const root = await setupRepository();
    await writeChange(root, { execution: 'standard' });
    await writeFindings(root, 'spec-reviewer.json', {
      schema_version: 1,
      reviewer: 'spec-reviewer',
      axis: 'spec',
      status: 'pass',
      findings: [],
    });

    const recorded = await new WorkflowHarness(root).recordReview('add-value', {
      standards: 'pass',
      spec: 'pass',
      body: '# Review\n',
      findings: ['spec-reviewer.json'],
    });

    expect(recorded.status).toBe('pass');
    expect(recorded.reviewers).toEqual([
      {
        id: 'spec-reviewer',
        axis: 'spec',
        findings_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    ]);
    expect(recorded.body).not.toContain('## Spec findings');
  });
});
