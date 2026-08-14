import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CodeGraphAdapter,
  graphCandidateFiles,
  graphProvider,
  SourceFallbackAdapter,
  UnavailableGraphAdapter,
} from '../../src/graph/graph-provider.js';

describe('GraphProvider', () => {
  it('extracts safe repository candidate files from fallback and CodeGraph output', () => {
    expect(
      graphCandidateFiles({
        provider: 'source-fallback',
        operation: 'explore',
        advisory: true,
        needsSourceConfirmation: true,
        output: 'src/auth.ts:10:authenticate()\n../escape.ts:1:bad\nsrc/billing.ts:4 write',
        warnings: [],
      }),
    ).toEqual(['src/auth.ts', 'src/billing.ts']);

    expect(
      graphCandidateFiles({
        provider: 'codegraph',
        operation: 'explore',
        advisory: true,
        needsSourceConfirmation: true,
        output: '',
        data: {
          nodes: [
            { filePath: 'src/domain/invoice.ts' },
            { location: { path: 'test/invoice.test.ts' } },
            { path: '/tmp/outside.ts' },
          ],
        },
        warnings: [],
      }),
    ).toEqual(['src/domain/invoice.ts', 'test/invoice.test.ts']);
  });

  it('normalizes CodeGraph output without treating it as verified fact', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-graph-'));
    await mkdir(path.join(root, '.codegraph'));
    const executable = path.join(root, 'fake-codegraph');
    await writeFile(
      executable,
      `#!/usr/bin/env node
const command = process.argv[2]
if (command === 'version') console.log('codegraph 1.2.3')
else if (command === 'status') console.log(JSON.stringify({ files: 42, stale: false }))
else if (command === 'explore') console.log('src/auth.ts:10 authenticate')
else process.exit(2)
`,
    );
    await chmod(executable, 0o755);

    const provider = new CodeGraphAdapter(root, executable);
    await expect(provider.readiness()).resolves.toMatchObject({
      provider: 'codegraph',
      available: true,
      indexed: true,
      stale: false,
    });
    await expect(provider.explore('authentication')).resolves.toMatchObject({
      provider: 'codegraph',
      advisory: true,
      needsSourceConfirmation: true,
    });
  });

  it('falls back to source search when CodeGraph is unavailable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-source-'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'auth.ts'), 'export function authenticate() {}');
    const result = await new SourceFallbackAdapter(root).explore('authenticate');
    expect(result.provider).toBe('source-fallback');
    expect(result.output).toContain('src/auth.ts');
    expect(result.warnings[0]).toContain('CodeGraph');
    await expect(new SourceFallbackAdapter(root).impact('authenticate')).resolves.toMatchObject({
      operation: 'impact',
    });
    await expect(new SourceFallbackAdapter(root).affected(['src/auth.ts'])).resolves.toMatchObject({
      operation: 'affected',
    });
    await expect(graphProvider(root, 'none')).resolves.toBeInstanceOf(SourceFallbackAdapter);
  });

  it('reports missing indexes and disabled providers cleanly', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-unavailable-'));
    const executable = path.join(root, 'fake-codegraph');
    await writeFile(
      executable,
      `#!/usr/bin/env node
if (process.argv[2] === 'version') console.log('codegraph 1.2.3')
else { console.error('query failed'); process.exit(2) }
`,
    );
    await chmod(executable, 0o755);
    await expect(new CodeGraphAdapter(root, executable).readiness()).resolves.toMatchObject({
      available: true,
      indexed: false,
    });
    await expect(new CodeGraphAdapter(root, executable).impact('missing')).rejects.toThrow(
      'query failed',
    );
    await expect(new CodeGraphAdapter(root, 'does-not-exist').readiness()).resolves.toMatchObject({
      available: false,
    });

    const unavailable = new UnavailableGraphAdapter();
    await expect(unavailable.readiness()).resolves.toMatchObject({ available: false });
    await expect(unavailable.explore('x')).resolves.toMatchObject({
      provider: 'unavailable',
      operation: 'explore',
    });
    await expect(unavailable.impact('x')).resolves.toMatchObject({ operation: 'impact' });
    await expect(unavailable.affected(['x.ts'])).resolves.toMatchObject({
      operation: 'affected',
    });
  });

  it('falls back when an indexed CodeGraph query fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'specpilot-query-fallback-'));
    await mkdir(path.join(root, '.codegraph'));
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'billing.ts'), 'export const billing = true;\n');
    const executable = path.join(root, 'fake-codegraph');
    await writeFile(
      executable,
      `#!/usr/bin/env node
if (process.argv[2] === 'version') console.log('codegraph 1.2.3')
else if (process.argv[2] === 'status') console.log(JSON.stringify({ stale: false }))
else { console.error('temporary graph failure'); process.exit(2) }
`,
    );
    await chmod(executable, 0o755);

    const provider = await graphProvider(root, 'codegraph', executable);
    const result = await provider.explore('billing');
    expect(result.provider).toBe('source-fallback');
    expect(result.output).toContain('src/billing.ts');
    expect(result.warnings[0]).toContain('temporary graph failure');
  });
});
