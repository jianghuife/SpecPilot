import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { statusCommand } from '../../src/commands/status.js';

describe('status command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(os.tmpdir(), `comet-status-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prints the next command for active changes', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'next-build');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      [
        'workflow: full',
        'phase: build',
        'build_mode: executing-plans',
        'isolation: branch',
        'verify_mode: light',
        'verify_result: pending',
        'design_doc: docs/superpowers/specs/next-build.md',
        'plan: docs/superpowers/plans/next-build.md',
        'archived: false',
        '',
      ].join('\n'),
    );
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [x] done\n- [ ] todo\n');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output = '';
    try {
      await statusCommand(tmpDir);
      output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(output).toContain('next: /comet-build');
    expect(output).toContain('[1/2 tasks]');
  });

  it('includes next command in JSON output', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'next-verify');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      ['workflow: full', 'phase: verify', 'archived: false', ''].join('\n'),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await statusCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.changes[0].nextCommand).toBe('/comet-verify');
    expect(parsed.changes[0].autoTransition).toBeUndefined();
    expect(parsed.changes[0].nextAction).toBeUndefined();
  });

  it('prints actionable next-step recovery commands with --next', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'manual-build');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      [
        'workflow: full',
        'phase: build',
        'build_mode: executing-plans',
        'isolation: branch',
        'auto_transition: false',
        'archived: false',
        '',
      ].join('\n'),
    );
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [x] done\n- [ ] todo\n');

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let output = '';
    try {
      await statusCommand(tmpDir, { next: true });
      output = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    expect(output).toContain('Next Actions:');
    expect(output).toContain('manual-build [phase: build [1/2 tasks]]');
    expect(output).toContain('next: /comet-build (manual)');
    expect(output).toContain(
      '"$COMET_BASH" "$COMET_STATE" check manual-build build --recover',
    );
  });

  it('includes actionable next-step metadata in JSON output with --next', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'hotfix-build');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      ['workflow: hotfix', 'phase: build', 'auto_transition: true', 'archived: false', ''].join(
        '\n',
      ),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await statusCommand(tmpDir, { json: true, next: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const parsed = JSON.parse(json);
    expect(parsed.changes[0].nextAction).toMatchObject({
      mode: 'auto',
      skill: '/comet-hotfix',
      recoveryCommand: '"$COMET_BASH" "$COMET_STATE" check hotfix-build build --recover',
    });
  });
});
