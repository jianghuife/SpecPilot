import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { doctorCommand } from '../../src/commands/doctor.js';

describe('doctor command', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = path.join(
      os.tmpdir(),
      `comet-doctor-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts current comet state fields in JSON output', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'current-state');
    await fs.mkdir(changeDir, { recursive: true });
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'build_mode: executing-plans',
        'isolation: branch',
        'verify_mode: full',
        'verify_result: pending',
        'design_doc: docs/superpowers/specs/current-state.md',
        'plan: docs/superpowers/plans/current-state.md',
        'verification_report: docs/superpowers/reports/current-state.md',
        'branch_status: handled',
        'verified_at: null',
        'archived: false',
        '',
      ].join('\n'),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const results = JSON.parse(json).results as Array<{ check: string; status: string }>;
    expect(results.find((result) => result.check === '.comet.yaml: current-state')).toMatchObject({
      status: 'pass',
    });
  });

  it('only validates top-level keys in .comet.yaml', async () => {
    const validChangeDir = path.join(tmpDir, 'openspec', 'changes', 'nested-valid');
    await fs.mkdir(validChangeDir, { recursive: true });
    await fs.writeFile(
      path.join(validChangeDir, '.comet.yaml'),
      [
        'workflow: full',
        'phase: verify',
        'verify_result: pending',
        'archived: false',
        'verification_report:',
        '  nested_key: value',
        '',
      ].join('\n'),
    );

    const invalidChangeDir = path.join(tmpDir, 'openspec', 'changes', 'top-level-invalid');
    await fs.mkdir(invalidChangeDir, { recursive: true });
    await fs.writeFile(
      path.join(invalidChangeDir, '.comet.yaml'),
      ['workflow: full', 'phase: verify', 'unknown_root_field: true', ''].join('\n'),
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let json = '';
    try {
      await doctorCommand(tmpDir, { json: true });
      json = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const results = JSON.parse(json).results as Array<{
      check: string;
      status: string;
      message: string;
    }>;

    expect(results.find((result) => result.check === '.comet.yaml: nested-valid')).toMatchObject({
      status: 'pass',
    });

    expect(
      results.find((result) => result.check === '.comet.yaml: top-level-invalid'),
    ).toMatchObject({
      status: 'fail',
      message: expect.stringContaining('unknown_root_field'),
    });
  });

  it('adds workflow readiness checks only when requested', async () => {
    const changeDir = path.join(tmpDir, 'openspec', 'changes', 'workflow-ready');
    await fs.mkdir(path.join(changeDir, '.comet'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.codegraph'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, '.understand-anything'), { recursive: true });
    await fs.writeFile(path.join(tmpDir, '.understand-anything', 'knowledge-graph.json'), '{}\n');
    await fs.writeFile(
      path.join(tmpDir, '.comet.yaml'),
      'build_command: pnpm build\nverify_command: pnpm test\n',
    );
    await fs.writeFile(
      path.join(changeDir, '.comet.yaml'),
      ['workflow: full', 'phase: build', 'verify_result: pending', 'archived: false', ''].join(
        '\n',
      ),
    );
    await fs.writeFile(
      path.join(changeDir, '.comet', 'evidence.jsonl'),
      '{"phase":"build","status":"pass"}\n',
    );

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let defaultJson = '';
    let workflowJson = '';
    try {
      await doctorCommand(tmpDir, { json: true });
      defaultJson = log.mock.calls.map((call) => call.join(' ')).join('\n');
      log.mockClear();
      await doctorCommand(tmpDir, { json: true, workflow: true });
      workflowJson = log.mock.calls.map((call) => call.join(' ')).join('\n');
    } finally {
      log.mockRestore();
    }

    const defaultResults = JSON.parse(defaultJson).results as Array<{ check: string }>;
    const workflowResults = JSON.parse(workflowJson).results as Array<{
      check: string;
      status: string;
      message: string;
    }>;

    expect(defaultResults.some((result) => result.check.startsWith('workflow:'))).toBe(false);
    expect(
      workflowResults.find((result) => result.check === 'workflow: active changes'),
    ).toMatchObject({
      status: 'pass',
      message: expect.stringContaining('workflow-ready'),
    });
    expect(
      workflowResults.find((result) => result.check === 'workflow: CodeGraph index'),
    ).toMatchObject({
      status: 'pass',
    });
    expect(
      workflowResults.find((result) => result.check === 'workflow: Understand Anything graph'),
    ).toMatchObject({ status: 'pass' });
    expect(
      workflowResults.find((result) => result.check === 'workflow: build command'),
    ).toMatchObject({
      status: 'pass',
      message: expect.stringContaining('pnpm build'),
    });
    expect(
      workflowResults.find((result) => result.check === 'workflow: evidence: workflow-ready'),
    ).toMatchObject({
      status: 'pass',
    });
  });
});
