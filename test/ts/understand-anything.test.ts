import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'child_process';

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockedExecFileSync = vi.mocked(execFileSync);

describe('Understand Anything installer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a skills CLI command for the selected platforms', async () => {
    const { buildUnderstandAnythingInstallCommand } = await import(
      '../../src/core/understand-anything.js'
    );

    expect(buildUnderstandAnythingInstallCommand('project', ['claude', 'codex'])).toEqual({
      command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
      args: [
        'skills',
        'add',
        'Lum1104/Understand-Anything',
        '-y',
        '--full-depth',
        '--skill',
        '*',
        '--agent',
        'claude-code',
        '--agent',
        'codex',
      ],
    });
  });

  it('passes -g for global scope', async () => {
    const { buildUnderstandAnythingInstallCommand } = await import(
      '../../src/core/understand-anything.js'
    );

    expect(buildUnderstandAnythingInstallCommand('global', ['claude']).args).toContain('-g');
  });

  it('returns installed when the skills CLI succeeds', async () => {
    mockedExecFileSync.mockReturnValueOnce(Buffer.from('installed'));

    const { installUnderstandAnythingForPlatforms } = await import(
      '../../src/core/understand-anything.js'
    );
    const result = await installUnderstandAnythingForPlatforms('/tmp/test', 'project', [
      'claude',
      'codex',
    ]);

    expect(result).toBe('installed');
    expect(mockedExecFileSync).toHaveBeenCalledWith(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      expect.arrayContaining(['skills', 'add', 'Lum1104/Understand-Anything']),
      expect.objectContaining({ cwd: '/tmp/test', timeout: 300_000 }),
    );
  });

  it('returns skipped when no selected platform has a skills CLI agent', async () => {
    const { installUnderstandAnythingForPlatforms } = await import(
      '../../src/core/understand-anything.js'
    );

    await expect(
      installUnderstandAnythingForPlatforms('/tmp/test', 'project', ['lingma']),
    ).resolves.toBe('skipped');
    expect(mockedExecFileSync).not.toHaveBeenCalled();
  });
});
