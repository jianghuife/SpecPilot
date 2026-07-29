import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryCatalog } from '../../src/memory/memory-catalog.js';
import { ProjectStore } from '../../src/project/project-store.js';

describe('MemoryCatalog', () => {
  it('rebuilds its disposable index and only promotes verified knowledge', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-memory-'));
    await mkdir(path.join(root, 'specs', 'project', 'standards'), { recursive: true });
    await mkdir(path.join(root, '.specpilot', 'local', 'knowledge-candidates'), {
      recursive: true,
    });
    await writeFile(
      path.join(root, 'specs', 'project', 'glossary.md'),
      '# Glossary\n\nInvoice means a finalized customer charge.\n',
    );
    await writeFile(
      path.join(root, 'specs', 'project', 'standards', 'testing.md'),
      '# Testing\n\nBilling changes require an integration test.\n',
    );

    const catalog = new MemoryCatalog(root);
    const first = await catalog.search('billing integration');
    expect(first.map((entry) => entry.relativePath)).toContain(
      'specs/project/standards/testing.md',
    );
    await rm(path.join(root, '.specpilot', 'cache'), { recursive: true, force: true });
    const rebuilt = await catalog.search('invoice');
    expect(rebuilt[0]?.content).toContain('finalized customer charge');

    const candidate = path.join(
      root,
      '.specpilot',
      'local',
      'knowledge-candidates',
      'billing-boundary.md',
    );
    await writeFile(
      candidate,
      `---
domain: billing
summary: Billing writes cross the invoice boundary.
source_refs:
  - src/billing.ts
evidence_refs:
  - .specpilot/evidence/billing/task/final.json
invalidation_condition: The billing write path changes.
verified_at: 2026-07-29T00:00:00.000Z
---
# Billing boundary
`,
    );
    const promoted = await catalog.promote(candidate);
    expect(promoted).toBe(path.join(root, 'specs', 'knowledge', 'billing-boundary.md'));

    await writeFile(
      candidate,
      `---
domain: billing
summary: Unverified claim
source_refs: []
evidence_refs: []
verified_at: 2026-07-29T00:00:00.000Z
---
# Bad candidate
`,
    );
    await expect(catalog.promote(candidate)).rejects.toThrow('invalidation_condition');
  });

  it('stores one local active change/task pointer', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-session-'));
    const catalog = new MemoryCatalog(root);
    await catalog.activateSession('billing', 'implement');
    await expect(catalog.readSession()).resolves.toMatchObject({
      active_change: 'billing',
      active_task: 'implement',
    });

    // A corrupt pointer cannot be trusted, so it degrades to "no session"
    // instead of failing status/resume.
    await writeFile(
      path.join(root, '.specpilot', 'local', 'session.json'),
      '{"schema_version":2,"active_change":"billing"}\n',
    );
    await expect(catalog.readSession()).resolves.toBeUndefined();

    await writeFile(path.join(root, '.specpilot', 'local', 'session.json'), 'not json\n');
    await expect(catalog.readSession()).resolves.toBeUndefined();

    await catalog.activateSession('billing', 'implement');
    await expect(catalog.readSession()).resolves.toMatchObject({ active_change: 'billing' });
  });

  it('resolves a task context manifest and reports missing references', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-context-list-'));
    const store = new ProjectStore(root);
    await store.createChange({ id: 'billing', title: 'Billing', kind: 'light' });
    await store.addTask('billing', { id: 'implement', title: 'Implement billing' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'testing.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Testing\n');
    await store.addTaskContext('billing', 'implement', 'work', {
      path: 'specs/project/standards/testing.md',
      reason: 'Billing requires integration coverage.',
    });
    await rm(standard);

    await expect(
      new MemoryCatalog(root).contextFor('billing', 'implement', 'work'),
    ).resolves.toMatchObject({
      changeId: 'billing',
      taskId: 'implement',
      purpose: 'work',
      references: [
        {
          path: 'specs/changes/billing/spec.md',
          exists: true,
        },
        {
          path: 'specs/project/standards/testing.md',
          exists: false,
        },
      ],
      missing: ['specs/project/standards/testing.md'],
    });
  });
});
