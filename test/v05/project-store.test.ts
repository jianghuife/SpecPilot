import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
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

    const summary = await new ProjectStore(root).inspectChange('checkout');

    expect(summary.tasks).toMatchObject({ total: 2, done: 1, waived: 1 });
    expect(summary.issues).toContain('task dependency cycle: api -> ui -> api');
    expect(summary.issues).toContain('waived task ui requires waiver_reason');
  });
});
