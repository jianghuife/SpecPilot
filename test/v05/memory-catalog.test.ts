import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EvidenceRunner } from '../../src/evidence/evidence-runner.js';
import type { GraphProvider } from '../../src/graph/graph-provider.js';
import { MemoryCatalog } from '../../src/memory/memory-catalog.js';
import { ProjectStore } from '../../src/project/project-store.js';
import { initializeProject } from '../../src/project/initialize.js';

const PASS = [process.execPath, '-e', 'process.exit(0)'];

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
    await writeFile(
      path.join(root, 'specs', 'project', 'standards', 'testing.md'),
      '# Testing\n\nBilling changes require a contract test.\n',
    );
    const refreshed = await catalog.search('contract');
    expect(refreshed[0]?.content).toContain('contract test');
    await rm(path.join(root, '.specpilot', 'cache'), { recursive: true, force: true });
    const rebuilt = await catalog.search('invoice');
    expect(rebuilt[0]?.content).toContain('finalized customer charge');

    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'billing.ts'), 'export const billing = true;\n');
    const store = new ProjectStore(root);
    await store.createChange({ id: 'billing', title: 'Billing', kind: 'light' });
    await store.addTask('billing', { id: 'task', title: 'Verify billing' });
    const evidence = await new EvidenceRunner(root).run({
      changeId: 'billing',
      taskId: 'task',
      phase: 'final',
      command: PASS,
    });

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
  - ${evidence.record_path}
invalidation_condition: The billing write path changes.
verified_at: 2026-07-29T00:00:00.000Z
---
# Billing boundary
`,
    );
    await catalog.reviewCandidate(candidate, {
      decision: 'approved',
      reviewer: 'human:hui',
      reason: 'Confirmed against source and final evidence.',
    });
    const promoted = await catalog.promote(candidate);
    expect(promoted).toBe(path.join(root, 'specs', 'knowledge', 'billing-boundary.md'));
    await rm(path.join(root, 'specs', 'knowledge', 'billing-boundary.attestation.json'));
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({
      healthy: true,
      cache_hit: false,
      summary: { trusted: 1, stale: 0, invalid: 0, conflict: 0 },
    });
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({ cache_hit: false });

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

  it('promotes an OKF concept only when its current content has human review and valid provenance', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-okf-'));
    await mkdir(path.join(root, '.specpilot', 'local', 'knowledge-candidates'), {
      recursive: true,
    });
    await writeFile(path.join(root, 'AGENTS.md'), '# Architecture boundaries\n');
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'architecture.ts'), 'export const boundary = true;\n');
    const store = new ProjectStore(root);
    await store.createChange({ id: 'architecture', title: 'Architecture', kind: 'light' });
    await store.addTask('architecture', { id: 'verify', title: 'Verify architecture' });
    const evidence = await new EvidenceRunner(root).run({
      changeId: 'architecture',
      taskId: 'verify',
      phase: 'final',
      command: PASS,
    });
    const candidate = path.join(
      root,
      '.specpilot',
      'local',
      'knowledge-candidates',
      'architecture-boundaries.md',
    );
    await writeFile(
      candidate,
      `---
type: Architecture Boundary
title: Backend architecture boundaries
description: Domain code must not depend on web adapters.
sources:
  - id: repository-rules
    resource: AGENTS.md
    author: team:architecture
generated:
  by: specpilot/0.8
  at: 2026-08-05T09:00:00.000Z
verified:
  - by: human:hui
    at: 2026-08-05T10:00:00.000Z
status: stable
stale_after: 2099-01-01
specpilot:
  domain: architecture
  criticality: p0
  authority: normative
  load_policy: required_when_matched
  evidence_refs:
    - ${evidence.record_path}
  invalidation:
    description: Layer responsibilities or permitted call directions change.
    watch_paths:
      - AGENTS.md
      - src/**/*.ts
---
# Backend architecture boundaries
`,
    );

    const catalog = new MemoryCatalog(root);
    await expect(catalog.promote(candidate)).rejects.toThrow(
      'knowledge promotion requires an approved review receipt',
    );
    const original = await readFile(candidate, 'utf8');
    const receipt = await catalog.reviewCandidate(candidate, {
      decision: 'approved',
      reviewer: 'human:hui',
      reason: 'Architecture owner confirmed the boundary and provenance.',
    });
    expect(receipt.candidate_sha256).toMatch(/^[a-f0-9]{64}$/);

    await writeFile(candidate, `${original}\nPost-review mutation.\n`);
    await expect(catalog.promote(candidate)).rejects.toThrow(
      'knowledge candidate changed after review',
    );

    await writeFile(candidate, original);
    await catalog.reviewCandidate(candidate, {
      decision: 'approved',
      reviewer: 'human:hui',
      reason: 'Reconfirmed the restored candidate.',
    });
    const promoted = await catalog.promote(candidate);
    expect(await readFile(promoted, 'utf8')).toContain('type: Architecture Boundary');
    await expect(
      readFile(
        path.join(root, 'specs', 'knowledge', 'architecture-boundaries.attestation.json'),
        'utf8',
      ),
    ).resolves.toContain('provenance_sha256');
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({
      healthy: true,
      cache_hit: false,
      summary: { trusted: 1, stale: 0, invalid: 0, conflict: 0 },
    });
    await expect(new MemoryCatalog(root).auditKnowledge()).resolves.toMatchObject({
      healthy: true,
      cache_hit: true,
      summary: { trusted: 1, stale: 0, invalid: 0, conflict: 0 },
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(Date.now() + 86_400_000));
      await expect(new MemoryCatalog(root).auditKnowledge()).resolves.toMatchObject({
        healthy: true,
        cache_hit: false,
      });
    } finally {
      vi.useRealTimers();
    }
    await writeFile(path.join(root, 'AGENTS.md'), '# Changed architecture boundaries\n');
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({
      healthy: false,
      cache_hit: false,
      summary: { trusted: 0, stale: 1, invalid: 0, conflict: 0 },
    });
    await writeFile(path.join(root, 'AGENTS.md'), '# Architecture boundaries\n');
    await writeFile(path.join(root, 'src', 'architecture.ts'), 'export const boundary = false;\n');
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({
      healthy: false,
      summary: { trusted: 0, stale: 1, invalid: 0, conflict: 0 },
    });
    await writeFile(path.join(root, 'src', 'architecture.ts'), 'export const boundary = true;\n');
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({
      healthy: true,
      cache_hit: false,
      summary: { trusted: 1, stale: 0, invalid: 0, conflict: 0 },
    });
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({ cache_hit: true });
    await writeFile(path.join(root, 'src', 'new-member.ts'), 'export const added = true;\n');
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({
      healthy: false,
      cache_hit: false,
      summary: { trusted: 0, stale: 1, invalid: 0, conflict: 0 },
    });
    await rm(path.join(root, 'src', 'new-member.ts'));
    await expect(new MemoryCatalog(root).search('web adapters')).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'specs/knowledge/architecture-boundaries.md',
          domain: 'architecture',
          title: 'Backend architecture boundaries',
        }),
      ]),
    );

    const promotedContent = await readFile(promoted, 'utf8');
    await writeFile(promoted, promotedContent.replace('2099-01-01', '2020-01-01'));
    const staleAudit = await catalog.auditKnowledge();
    expect(staleAudit).toMatchObject({
      healthy: false,
      summary: { trusted: 0, stale: 1, invalid: 0, conflict: 0 },
    });
    await expect(catalog.search('web adapters')).resolves.toEqual([]);
    await store.addTaskContext('architecture', 'verify', 'work', {
      path: 'specs/knowledge/architecture-boundaries.md',
      reason: 'The task must obey the verified architecture boundary.',
    });
    await expect(catalog.contextFor('architecture', 'verify', 'work')).resolves.toMatchObject({
      missing: [],
      invalid: ['specs/knowledge/architecture-boundaries.md'],
    });
    await expect(
      new EvidenceRunner(root).run({
        changeId: 'architecture',
        taskId: 'verify',
        phase: 'green',
        command: PASS,
      }),
    ).rejects.toThrow('verification context is untrusted');
    await store.removeTaskContext(
      'architecture',
      'verify',
      'work',
      'specs/knowledge/architecture-boundaries.md',
    );

    await writeFile(promoted, promotedContent);
    await writeFile(
      path.join(root, 'specs', 'knowledge', 'duplicate-boundaries.md'),
      promotedContent,
    );
    await expect(catalog.auditKnowledge()).resolves.toMatchObject({
      healthy: false,
      summary: { trusted: 0, stale: 0, invalid: 0, conflict: 2 },
    });
    await rm(path.join(root, 'specs', 'knowledge', 'duplicate-boundaries.md'));

    await writeFile(
      candidate,
      (await readFile(candidate, 'utf8')).replace(
        'at: 2026-08-05T10:00:00.000Z',
        'at: 2026-08-05T08:00:00.000Z',
      ),
    );
    await expect(new MemoryCatalog(root).promote(candidate)).rejects.toThrow(
      'human verification must not predate generated content',
    );
  });

  it('does not promote a candidate with a rejected review receipt', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-review-rejected-'));
    const candidates = path.join(root, '.specpilot', 'local', 'knowledge-candidates');
    await mkdir(candidates, { recursive: true });
    const candidate = path.join(candidates, 'rejected.md');
    await writeFile(
      candidate,
      `---
domain: billing
summary: Rejected knowledge.
source_refs: [src/billing.ts]
evidence_refs: [.specpilot/evidence/billing/task/final.json]
invalidation_condition: Billing changes.
verified_at: 2026-08-05T00:00:00.000Z
---
# Rejected
`,
    );
    const catalog = new MemoryCatalog(root);
    const receipt = await catalog.reviewCandidate(candidate, {
      decision: 'rejected',
      reviewer: 'human:hui',
      reason: 'The claim is broader than the available evidence.',
    });
    expect(receipt.decision).toBe('rejected');

    await expect(catalog.promote(candidate)).rejects.toThrow(
      'knowledge promotion requires an approved review receipt',
    );
  });

  it('rejects knowledge whose source or evidence provenance cannot be verified', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-provenance-'));
    const candidates = path.join(root, '.specpilot', 'local', 'knowledge-candidates');
    await mkdir(candidates, { recursive: true });
    const candidate = path.join(candidates, 'broken.md');
    await writeFile(
      candidate,
      `---
domain: billing
summary: Broken provenance.
source_refs: [src/missing.ts]
evidence_refs: [.specpilot/evidence/missing/task/final.json]
invalidation_condition: The source changes.
verified_at: 2026-08-05T00:00:00.000Z
---
# Broken
`,
    );
    const catalog = new MemoryCatalog(root);
    await catalog.reviewCandidate(candidate, {
      decision: 'approved',
      reviewer: 'human:hui',
      reason: 'Reviewing the provenance failure behavior.',
    });

    await expect(catalog.promote(candidate)).rejects.toThrow(
      'source reference does not exist: src/missing.ts',
    );
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'missing.ts'), 'export {};\n');
    await expect(catalog.promote(candidate)).rejects.toThrow(
      'evidence reference is missing, invalid, or stale',
    );
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

  it('fingerprints the manifest, reasons, and referenced context contents', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-context-snapshot-'));
    const store = new ProjectStore(root);
    await store.createChange({ id: 'billing', title: 'Billing', kind: 'light' });
    await store.addTask('billing', { id: 'implement', title: 'Implement billing' });
    const standard = path.join(root, 'specs', 'project', 'standards', 'testing.md');
    await mkdir(path.dirname(standard), { recursive: true });
    await writeFile(standard, '# Testing\n\nRun billing integration tests.\n');
    await store.addTaskContext('billing', 'implement', 'work', {
      path: 'specs/project/standards/testing.md',
      reason: 'Billing requires integration coverage.',
    });
    const catalog = new MemoryCatalog(root);

    const before = await catalog.contextSnapshot('billing', 'implement', 'work');
    expect(before.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(before.totalBytes).toBeGreaterThan(0);

    await writeFile(standard, '# Testing\n\nRun the expanded billing integration suite.\n');
    const after = await catalog.contextSnapshot('billing', 'implement', 'work');
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('suggests relevant non-template context in priority order without exceeding its budget', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-context-suggest-'));
    await initializeProject({
      projectPath: root,
      hosts: ['codex'],
      graph: 'none',
      contextMaxBytes: 4_096,
    });
    const store = new ProjectStore(root);
    await store.createChange({ id: 'billing-api', title: 'Billing API contract', kind: 'light' });
    await store.addTask('billing-api', {
      id: 'change-contract',
      title: 'Change billing API contract',
    });
    await writeFile(
      path.join(root, 'specs', 'project', 'contracts', 'README.md'),
      `# Billing API contract\n\n${'contract '.repeat(300)}\n`,
    );
    await writeFile(
      path.join(root, 'specs', 'project', 'standards', 'testing.md'),
      `# Billing API testing\n\n${'testing '.repeat(300)}\n`,
    );

    const report = await new MemoryCatalog(root).suggestContext(
      'billing-api',
      'change-contract',
      'work',
    );
    expect(report.selected.map((item) => item.path)).toContain('specs/project/contracts/README.md');
    expect(report.omitted.map((item) => item.path)).toContain('specs/project/standards/testing.md');
    expect(report.existingBytes + report.selectedBytes).toBeLessThanOrEqual(report.budgetBytes);
    expect(report.selected[0]).toMatchObject({
      priority: 'p0',
      knowledgeTypes: ['api-data-event-contracts'],
    });
  });
});

describe('MemoryCatalog candidate validation', () => {
  async function setupCandidate(root: string): Promise<string> {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'billing.ts'), 'export const billing = true;\n');
    const store = new ProjectStore(root);
    await store.createChange({ id: 'billing', title: 'Billing', kind: 'light' });
    await store.addTask('billing', { id: 'task', title: 'Verify billing' });
    const evidence = await new EvidenceRunner(root).run({
      changeId: 'billing',
      taskId: 'task',
      phase: 'final',
      command: PASS,
    });
    const directory = path.join(root, '.specpilot', 'local', 'knowledge-candidates');
    await mkdir(directory, { recursive: true });
    const candidate = path.join(directory, 'billing-boundary.md');
    await writeFile(
      candidate,
      `---
domain: billing
summary: Billing writes cross the invoice boundary.
source_refs:
  - src/billing.ts
evidence_refs:
  - ${evidence.record_path}
invalidation_condition: The billing write path changes.
verified_at: 2026-07-29T00:00:00.000Z
---
# Billing boundary
`,
    );
    return candidate;
  }

  it('validates a well-formed candidate and reports the receipt lifecycle', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-validate-'));
    const candidate = await setupCandidate(root);
    const catalog = new MemoryCatalog(root);

    const initial = await catalog.validateCandidate(candidate);
    expect(initial).toEqual({
      candidate: '.specpilot/local/knowledge-candidates/billing-boundary.md',
      valid: true,
      issues: [],
      receipt: 'missing',
    });

    await catalog.reviewCandidate(candidate, {
      decision: 'approved',
      reviewer: 'human:hui',
      reason: 'Confirmed against source and final evidence.',
    });
    await expect(catalog.validateCandidate(candidate)).resolves.toMatchObject({
      valid: true,
      receipt: 'approved',
    });

    await writeFile(candidate, `${await readFile(candidate, 'utf8')}\nAmended after review.\n`);
    await expect(catalog.validateCandidate(candidate)).resolves.toMatchObject({
      receipt: 'stale',
    });
  });

  it('reports contract and provenance issues without throwing', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-validate-'));
    const directory = path.join(root, '.specpilot', 'local', 'knowledge-candidates');
    await mkdir(directory, { recursive: true });
    const candidate = path.join(directory, 'bad-candidate.md');
    await writeFile(
      candidate,
      `---
domain: billing
summary: Unverified claim
source_refs:
  - src/missing.ts
evidence_refs: []
verified_at: 2026-07-29T00:00:00.000Z
---
# Bad candidate
`,
    );

    const result = await new MemoryCatalog(root).validateCandidate(candidate);

    expect(result.valid).toBe(false);
    expect(result.issues.join('\n')).toMatch(/invalidation_condition/);
    expect(result.receipt).toBe('missing');
  });

  it('rejects candidates outside the knowledge-candidates directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-validate-'));
    const outside = path.join(root, 'outside.md');
    await writeFile(outside, '# Outside\n');

    await expect(new MemoryCatalog(root).validateCandidate(outside)).rejects.toThrow(
      /knowledge-candidates/,
    );
  });

  it('ranks candidates using the approved spec documents, not only task text', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-suggest-'));
    const store = new ProjectStore(root);
    await store.createChange({ id: 'billing-api', title: 'Billing API', kind: 'light' });
    await store.addTask('billing-api', { id: 'implement', title: 'Implement the change' });
    await writeFile(
      path.join(root, 'specs', 'changes', 'billing-api', 'spec.md'),
      '# Billing API\n\nAll write endpoints must be idempotent and accept idempotency keys.\n',
    );
    await mkdir(path.join(root, 'specs', 'project', 'standards'), { recursive: true });
    await writeFile(
      path.join(root, 'specs', 'project', 'standards', 'idempotency.md'),
      '# Idempotency\n\nIdempotent writes require client-supplied request keys.\n',
    );

    const report = await new MemoryCatalog(root).suggestContext('billing-api', 'implement', 'work');

    expect(report.selected.map((item) => item.path)).toContain(
      'specs/project/standards/idempotency.md',
    );
  });

  it('applies per-purpose context budgets with fallback to the shared budget', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-budget-'));
    const store = new ProjectStore(root);
    await store.createChange({ id: 'budgeted', title: 'Budgeted change', kind: 'light' });
    await store.addTask('budgeted', { id: 'implement', title: 'Implement' });
    await mkdir(path.join(root, '.specpilot'), { recursive: true });
    await writeFile(
      path.join(root, '.specpilot', 'config.json'),
      JSON.stringify({
        schema_version: 1,
        managed_version: 'test',
        language: 'en',
        hosts: ['codex'],
        graph: { provider: 'none', required: false },
        context: { per_turn_state: false, max_bytes: 65_536, work_bytes: 4_096 },
        optional_skills: [],
      }),
    );

    const catalog = new MemoryCatalog(root);
    const work = await catalog.contextSnapshot('budgeted', 'implement', 'work');
    const review = await catalog.contextSnapshot('budgeted', 'implement', 'review');

    expect(work.budgetBytes).toBe(4_096);
    expect(review.budgetBytes).toBe(65_536);
  });

  it('boosts trusted knowledge whose provenance intersects graph candidates', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-graph-context-'));
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'billing.ts'), 'export const billing = true;\n');
    await writeFile(path.join(root, 'src', 'general.ts'), 'export const general = true;\n');
    await writeFile(path.join(root, 'AGENTS.md'), '# Repository rules\n');
    const store = new ProjectStore(root);
    await store.createChange({ id: 'billing-change', title: 'Update service', kind: 'light' });
    await store.addTask('billing-change', { id: 'implement', title: 'Change billing service' });
    await writeFile(
      path.join(root, 'specs', 'changes', 'billing-change', 'spec.md'),
      '# Billing service change\n\nPreserve the billing contract.\n',
    );
    const evidence = await new EvidenceRunner(root).run({
      changeId: 'billing-change',
      taskId: 'implement',
      phase: 'final',
      command: PASS,
    });
    const knowledgeDirectory = path.join(root, 'specs', 'knowledge');
    await mkdir(knowledgeDirectory, { recursive: true });
    const concept = (title: string, watchPath: string): string => `---
type: Architecture Boundary
title: ${title}
description: Billing service contract guidance.
sources:
  - id: repository-rules
    resource: AGENTS.md
    author: team:billing
generated:
  by: specpilot/0.8
  at: 2026-08-05T09:00:00.000Z
verified:
  - by: human:hui
    at: 2026-08-05T10:00:00.000Z
status: stable
stale_after: 2099-01-01
specpilot:
  domain: billing
  criticality: p0
  authority: normative
  load_policy: required_when_matched
  evidence_refs:
    - ${evidence.record_path}
  invalidation:
    description: Billing source responsibilities change.
    watch_paths:
      - ${watchPath}
---
# ${title}
`;
    await writeFile(
      path.join(knowledgeDirectory, 'a-general.md'),
      concept('Billing service contract guidance', 'src/general.ts'),
    );
    await writeFile(
      path.join(knowledgeDirectory, 'z-billing.md'),
      concept('Billing source guidance', 'src/billing*.ts'),
    );
    const catalog = new MemoryCatalog(root);
    const baseline = await catalog.suggestContext('billing-change', 'implement', 'work');
    expect(baseline.selected[0]?.path).toBe('specs/knowledge/a-general.md');

    const graph: GraphProvider = {
      readiness: async () => ({
        provider: 'codegraph',
        available: true,
        indexed: true,
        stale: false,
      }),
      explore: async () => ({
        provider: 'codegraph',
        operation: 'explore',
        advisory: true,
        needsSourceConfirmation: true,
        output: 'src/billing.ts:1:export const billing = true',
        warnings: [],
      }),
      impact: async () => {
        throw new Error('not used');
      },
      affected: async () => {
        throw new Error('not used');
      },
    };
    const boosted = await catalog.suggestContext('billing-change', 'implement', 'work', {
      graph,
    });
    expect(boosted.selected[0]).toMatchObject({
      path: 'specs/knowledge/z-billing.md',
      graphMatchedFiles: ['src/billing.ts'],
    });
    expect(boosted.selected[0]?.reason).toContain('Graph candidates intersect provenance');

    const failingGraph: GraphProvider = {
      ...graph,
      explore: async () => {
        throw new Error('temporary graph failure');
      },
    };
    const fallback = await catalog.suggestContext('billing-change', 'implement', 'work', {
      graph: failingGraph,
    });
    expect(fallback.selected.map((item) => item.path)).toEqual(
      baseline.selected.map((item) => item.path),
    );
  });
});
