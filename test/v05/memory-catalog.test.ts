import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryCatalog } from '../../src/memory/memory-catalog.js';

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
    await catalog.writeSession({ active_change: 'billing', active_task: 'implement' });
    await expect(catalog.readSession()).resolves.toMatchObject({
      active_change: 'billing',
      active_task: 'implement',
    });
  });
});
