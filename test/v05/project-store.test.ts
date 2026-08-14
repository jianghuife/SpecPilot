import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { ProjectStore } from '../../src/project/project-store.js';

async function writeTask(
  root: string,
  changeId: string,
  fileName: string,
  frontmatter: Record<string, unknown>,
): Promise<void> {
  const directory = path.join(root, 'specs', 'changes', changeId, 'tasks');
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, fileName),
    `---\n${Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n')}\n---\n\n# ${frontmatter.title}\n`,
  );
}

describe('ProjectStore scaffolding', () => {
  it('creates changes, tasks, and spec approval with validated writes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-scaffold-'));
    const store = new ProjectStore(root);

    const created = await store.createChange({
      id: 'checkout-flow',
      title: 'Checkout flow',
      kind: 'standard',
    });
    expect(created.writtenPaths).toContain('specs/changes/checkout-flow/change.yaml');
    expect(created.writtenPaths).toContain('specs/changes/checkout-flow/spec.md');
    expect(created.writtenPaths).toContain('specs/changes/checkout-flow/design.md');
    expect(created.writtenPaths).toContain('specs/changes/checkout-flow/plan.md');

    await store.addTask('checkout-flow', { id: 'api', title: 'API' });
    await store.addTask('checkout-flow', {
      id: 'ui',
      title: 'UI',
      execution: 'tdd',
      blockedBy: ['api'],
    });
    await expect(store.readTaskContext('checkout-flow', 'ui')).resolves.toMatchObject({
      schema_version: 1,
      change_id: 'checkout-flow',
      task_id: 'ui',
      work: [
        { path: 'specs/changes/checkout-flow/spec.md' },
        { path: 'specs/changes/checkout-flow/design.md' },
        { path: 'specs/changes/checkout-flow/plan.md' },
      ],
      review: [
        { path: 'specs/changes/checkout-flow/spec.md' },
        { path: 'specs/changes/checkout-flow/design.md' },
        { path: 'specs/changes/checkout-flow/plan.md' },
      ],
    });

    await expect(
      store.createChange({ id: 'checkout-flow', title: 'Again', kind: 'light' }),
    ).rejects.toThrow(/already exists/);
    await expect(store.createChange({ id: 'Bad_Id', title: 'Bad', kind: 'light' })).rejects.toThrow(
      /invalid change id/,
    );
    await expect(store.addTask('checkout-flow', { id: 'api', title: 'Duplicate' })).rejects.toThrow(
      /already exists/,
    );
    await expect(store.addTask('checkout-flow', { id: 'Bad_Id', title: 'Bad' })).rejects.toThrow(
      /invalid task id/,
    );

    expect((await store.readChange('checkout-flow')).spec_approved_at).toBeUndefined();
    const approved = await store.approveSpec('checkout-flow');
    expect(typeof approved.spec_approved_at).toBe('string');

    const inspection = await store.inspectChange('checkout-flow');
    expect(inspection.change.kind).toBe('standard');
    expect(inspection.change.spec_approved_at).toBe(approved.spec_approved_at);
    expect(inspection.tasks).toMatchObject({ total: 2, todo: 2, tdd: 1 });
    expect(inspection.taskRecords.find((task) => task.id === 'ui')?.blocked_by).toEqual(['api']);
    expect(inspection.issues).toEqual([]);

    await writeFile(
      path.join(created.changeDirectory, 'change.yaml'),
      YAML.stringify({
        ...inspection.change,
        status: 'closed',
        closed_at: '2026-07-29T00:02:00.000Z',
      }),
    );
    await expect(
      store.addTask('checkout-flow', { id: 'late-task', title: 'Late task' }),
    ).rejects.toThrow('change checkout-flow is not open');
  });

  it('creates light changes without design and plan documents', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-scaffold-'));
    const created = await new ProjectStore(root).createChange({
      id: 'fix-typo',
      title: 'Fix typo',
      kind: 'light',
    });
    expect(created.writtenPaths).not.toContain('specs/changes/fix-typo/design.md');
    expect(created.writtenPaths).not.toContain('specs/changes/fix-typo/plan.md');
  });

  it('transitions task status through validated artifact writes', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-transition-'));
    const store = new ProjectStore(root);
    await store.createChange({ id: 'checkout-flow', title: 'Checkout flow', kind: 'light' });
    const taskPath = await store.addTask('checkout-flow', {
      id: 'implement',
      title: 'Implement checkout',
    });
    await writeFile(taskPath, `${await readFile(taskPath, 'utf8')}\nKeep this task detail.\n`);

    await expect(store.transitionTask('checkout-flow', 'implement', 'complete')).rejects.toThrow(
      'cannot transition task implement from todo with complete',
    );
    await expect(store.transitionTask('checkout-flow', 'implement', 'block')).rejects.toThrow(
      'block requires a reason',
    );

    await expect(
      store.transitionTask('checkout-flow', 'implement', 'start'),
    ).resolves.toMatchObject({ id: 'implement', status: 'doing' });
    await expect(
      store.transitionTask('checkout-flow', 'implement', 'block', 'Waiting for the API contract.'),
    ).resolves.toMatchObject({
      status: 'blocked',
      blocked_reason: 'Waiting for the API contract.',
    });
    await expect(
      store.transitionTask('checkout-flow', 'implement', 'start'),
    ).resolves.toMatchObject({ status: 'doing', blocked_reason: undefined });
    await expect(store.transitionTask('checkout-flow', 'implement', 'waive')).rejects.toThrow(
      'waive requires a reason',
    );
    await expect(
      store.transitionTask(
        'checkout-flow',
        'implement',
        'waive',
        'Feature was removed from scope.',
      ),
    ).resolves.toMatchObject({
      status: 'waived',
      waiver_reason: 'Feature was removed from scope.',
    });

    const content = await readFile(taskPath, 'utf8');
    const frontmatter = YAML.parse(content.slice(4, content.indexOf('\n---\n', 4)));
    expect(frontmatter).toMatchObject({
      status: 'waived',
      waiver_reason: 'Feature was removed from scope.',
    });
    expect(frontmatter).not.toHaveProperty('blocked_reason');
    expect(content).toContain('Keep this task detail.');
  });

  it('curates task context inside repository-backed SpecPilot artifacts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-context-'));
    const store = new ProjectStore(root);
    await store.createChange({ id: 'checkout-flow', title: 'Checkout flow', kind: 'light' });
    await store.addTask('checkout-flow', { id: 'implement', title: 'Implement checkout' });
    await mkdir(path.join(root, 'specs', 'project', 'standards'), { recursive: true });
    await writeFile(path.join(root, 'specs', 'project', 'standards', 'testing.md'), '# Testing\n');
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'checkout.ts'), 'export {};\n');

    await expect(
      store.addTaskContext('checkout-flow', 'implement', 'work', {
        path: 'specs/project/standards/testing.md',
        reason: 'Checkout changes require integration coverage.',
      }),
    ).resolves.toMatchObject({
      work: expect.arrayContaining([
        {
          path: 'specs/project/standards/testing.md',
          reason: 'Checkout changes require integration coverage.',
        },
      ]),
    });
    await expect(
      store.removeTaskContext(
        'checkout-flow',
        'implement',
        'work',
        'specs/project/standards/testing.md',
      ),
    ).resolves.toMatchObject({
      work: [{ path: 'specs/changes/checkout-flow/spec.md' }],
    });
    await expect(
      store.addTaskContext('checkout-flow', 'implement', 'work', {
        path: 'src/checkout.ts',
        reason: 'Implementation target',
      }),
    ).rejects.toThrow('context references must stay inside specs/');

    await rm(store.taskContextPath('checkout-flow', 'implement'));
    await expect(store.readTaskContext('checkout-flow', 'implement')).resolves.toMatchObject({
      change_id: 'checkout-flow',
      task_id: 'implement',
      work: [{ path: 'specs/changes/checkout-flow/spec.md' }],
    });
  });

  it.skipIf(process.platform === 'win32')(
    'rejects context symlinks that leave their allowed artifact scope',
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-context-symlink-'));
      const store = new ProjectStore(root);
      await store.createChange({ id: 'checkout-flow', title: 'Checkout flow', kind: 'light' });
      await store.addTask('checkout-flow', { id: 'implement', title: 'Implement checkout' });
      const source = path.join(root, 'src', 'checkout.ts');
      const contextLink = path.join(root, 'specs', 'project', 'standards', 'source.ts');
      await mkdir(path.dirname(source), { recursive: true });
      await mkdir(path.dirname(contextLink), { recursive: true });
      await writeFile(source, 'export {};\n');
      await symlink(source, contextLink);

      await expect(
        store.addTaskContext('checkout-flow', 'implement', 'work', {
          path: 'specs/project/standards/source.ts',
          reason: 'Implementation target disguised as context.',
        }),
      ).rejects.toThrow('context file is missing or outside its allowed artifact scope');
    },
  );
});

describe('ProjectStore', () => {
  it('summarizes tasks and reports invalid dependency and waiver contracts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-store-'));
    const changeDirectory = path.join(root, 'specs', 'changes', 'checkout');
    await mkdir(changeDirectory, { recursive: true });
    await writeFile(
      path.join(changeDirectory, 'change.yaml'),
      `schema_version: 1\nid: checkout\ntitle: Checkout\nkind: standard\nstatus: open\ncreated_at: 2026-07-29T00:00:00.000Z\n`,
    );
    await writeTask(root, 'checkout', '001-api.md', {
      schema_version: 1,
      id: 'api',
      title: 'API',
      status: 'done',
      blocked_by: ['ui'],
      execution: 'standard',
    });
    await writeTask(root, 'checkout', '002-ui.md', {
      schema_version: 1,
      id: 'ui',
      title: 'UI',
      status: 'waived',
      blocked_by: ['api'],
      execution: 'tdd',
    });
    await writeTask(root, 'checkout', '003-copy.md', {
      schema_version: 1,
      id: 'copy',
      title: 'Copy',
      status: 'blocked',
      blocked_by: [],
      execution: 'standard',
    });

    const summary = await new ProjectStore(root).inspectChange('checkout');

    expect(summary.tasks).toMatchObject({ total: 3, done: 1, blocked: 1, waived: 1 });
    expect(summary.issues).toContain('task dependency cycle: api -> ui -> api');
    expect(summary.issues).toContain('waived task ui requires waiver_reason');
    expect(summary.issues).not.toContain('blocked task copy requires blocked_reason');
  });
});

describe('ProjectStore review findings', () => {
  async function setupFindings(root: string): Promise<string> {
    const directory = path.join(root, '.specpilot', 'local', 'review-findings');
    await mkdir(directory, { recursive: true });
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'service.ts'), 'export const value = 1;\n');
    return directory;
  }

  function findingsJson(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      schema_version: 1,
      reviewer: 'standards-reviewer',
      axis: 'standards',
      status: 'blocked',
      findings: [
        {
          severity: 'blocking',
          title: 'BillingService reaches into Invoice internals',
          evidence: [{ path: 'src/service.ts', lines: '1' }],
          recommendation: 'Move the calculation onto Invoice.',
        },
      ],
      ...overrides,
    });
  }

  it('parses a valid report and binds it to its content hash', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-findings-'));
    const directory = await setupFindings(root);
    const content = findingsJson();
    await writeFile(path.join(directory, 'standards-reviewer.json'), content);

    const reports = await new ProjectStore(root).readFindingsReports('standards-reviewer.json');

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatchObject({
      schema_version: 1,
      reviewer: 'standards-reviewer',
      axis: 'standards',
      status: 'blocked',
      findings: [
        {
          severity: 'blocking',
          title: 'BillingService reaches into Invoice internals',
          evidence: [{ path: 'src/service.ts', lines: '1' }],
          recommendation: 'Move the calculation onto Invoice.',
        },
      ],
    });
    expect(reports[0].sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('loads every findings file in a directory in sorted order', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-findings-'));
    const directory = await setupFindings(root);
    await writeFile(
      path.join(directory, 'spec-reviewer.json'),
      findingsJson({ reviewer: 'spec-reviewer', axis: 'spec', status: 'pass', findings: [] }),
    );
    await writeFile(path.join(directory, 'standards-reviewer.json'), findingsJson());
    await writeFile(path.join(directory, 'notes.md'), '# not findings\n');

    const reports = await new ProjectStore(root).readFindingsReports('.');

    expect(reports.map((report) => report.reviewer)).toEqual([
      'spec-reviewer',
      'standards-reviewer',
    ]);
  });

  it('rejects reports outside the review-findings directory', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-findings-'));
    await setupFindings(root);
    await writeFile(path.join(root, 'findings.json'), findingsJson());

    await expect(new ProjectStore(root).readFindingsReports('../findings.json')).rejects.toThrow(
      /review-findings/,
    );
    await expect(new ProjectStore(root).readFindingsReports('/etc/passwd.json')).rejects.toThrow(
      /review-findings/,
    );
  });

  it('rejects a blocking finding without evidence', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-findings-'));
    const directory = await setupFindings(root);
    await writeFile(
      path.join(directory, 'standards-reviewer.json'),
      findingsJson({
        findings: [{ severity: 'blocking', title: 'Unbacked claim', evidence: [] }],
      }),
    );

    await expect(
      new ProjectStore(root).readFindingsReports('standards-reviewer.json'),
    ).rejects.toThrow(/blocking finding.*evidence/i);
  });

  it('rejects a blocking finding whose evidence path does not exist in the repository', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-findings-'));
    const directory = await setupFindings(root);
    await writeFile(
      path.join(directory, 'standards-reviewer.json'),
      findingsJson({
        findings: [
          {
            severity: 'blocking',
            title: 'Missing evidence file',
            evidence: [{ path: 'src/missing.ts' }],
          },
        ],
      }),
    );

    await expect(
      new ProjectStore(root).readFindingsReports('standards-reviewer.json'),
    ).rejects.toThrow(/src\/missing\.ts/);
  });

  it('rejects evidence paths that escape the repository', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-findings-'));
    const directory = await setupFindings(root);
    await writeFile(
      path.join(directory, 'standards-reviewer.json'),
      findingsJson({
        findings: [
          {
            severity: 'warning',
            title: 'Escaped evidence',
            evidence: [{ path: '../outside.ts' }],
          },
        ],
      }),
    );

    await expect(
      new ProjectStore(root).readFindingsReports('standards-reviewer.json'),
    ).rejects.toThrow(/outside the repository|escape/i);
  });

  it('keeps reviews recorded before reviewer attribution readable', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'specpilot-findings-'));
    const changeDirectory = path.join(root, 'specs', 'changes', 'add-value');
    await mkdir(changeDirectory, { recursive: true });
    await writeFile(
      path.join(changeDirectory, 'change.yaml'),
      'schema_version: 1\nid: add-value\ntitle: Add value\nkind: light\nstatus: open\ncreated_at: 2026-07-29T00:00:00.000Z\n',
    );
    await writeFile(
      path.join(changeDirectory, 'review.md'),
      `---
schema_version: 1
status: pass
standards: pass
spec: pass
reviewed_at: 2026-07-29T00:02:00.000Z
worktree_fingerprint: ${'a'.repeat(64)}
spec_fingerprint: ${'b'.repeat(64)}
review_context_fingerprint: ${'c'.repeat(64)}
---
# Review
`,
    );

    const review = await new ProjectStore(root).readReview('add-value');

    expect(review.status).toBe('pass');
    expect(review.reviewers).toBeUndefined();
  });
});
