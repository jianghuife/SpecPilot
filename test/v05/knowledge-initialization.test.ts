import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryCatalog } from '../../src/memory/memory-catalog.js';
import { initializeProject } from '../../src/project/initialize.js';

describe('knowledge initialization', () => {
  it('inventories the codebase locally without promoting unreviewed knowledge', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-init-knowledge-'));
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'billing-service', scripts: { test: 'vitest run' } }),
    );
    await mkdir(path.join(root, 'src'), { recursive: true });
    await mkdir(path.join(root, 'test'), { recursive: true });
    await writeFile(path.join(root, 'src', 'billing.ts'), 'export const billing = true;\n');
    await writeFile(path.join(root, 'test', 'billing.test.ts'), 'test("billing", () => {});\n');
    await initializeProject({
      projectPath: root,
      hosts: ['codex'],
      graph: 'none',
    });

    const catalog = new MemoryCatalog(root);
    const dryRun = await catalog.initializeKnowledge({ dryRun: true });
    expect(dryRun.written).toBe(false);
    expect(dryRun.inventory).toMatchObject({
      knowledge_policy_version: 1,
      project_name: 'billing-service',
      manifests: ['package.json'],
      source_roots: ['src'],
      test_roots: ['test'],
      languages: { TypeScript: 2 },
      review_status: 'pending',
    });
    expect(dryRun.inventory.knowledge_coverage).toHaveLength(16);
    expect(dryRun.inventory.knowledge_coverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'architecture-boundaries',
          priority: 'p0',
          status: 'template',
        }),
        expect.objectContaining({
          id: 'agent-skills',
          priority: 'p1',
          status: 'covered',
        }),
        expect.objectContaining({
          id: 'requirements-archive',
          priority: 'p1',
          status: 'missing',
        }),
      ]),
    );
    expect(dryRun.inventory.priority_summary.p0).toEqual({
      covered: 0,
      template: 4,
      missing: 0,
    });
    await expect(readFile(dryRun.reportPath)).rejects.toThrow();

    const initialized = await catalog.initializeKnowledge();
    expect(initialized.written).toBe(true);
    expect(JSON.parse(await readFile(initialized.reportPath, 'utf8'))).toMatchObject({
      schema_version: 1,
      knowledge_policy_version: 1,
      project_name: 'billing-service',
      review_status: 'pending',
    });
    await expect(
      readFile(path.join(root, 'specs', 'knowledge', 'project-profile.md')),
    ).rejects.toThrow();
  });
});
