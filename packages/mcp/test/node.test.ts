/**
 * What touches the machine: the process, git and cloudflared. `node:child_process` is replaced,
 * so nothing is launched; the test checks what would be, and how.
 */

import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nodeDeps } from '../src/main.js';
import { openProject } from '../src/project.js';
import { openTunnel } from '../src/tunnel.js';

const child = vi.hoisted(() => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}));

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  spawn: child.spawn,
  execFileSync: child.execFileSync,
}));

afterEach(() => {
  vi.restoreAllMocks();
  child.spawn.mockReset();
  child.execFileSync.mockReset();
});

function fakeProcess(): EventEmitter & { stdout: EventEmitter; stderr: EventEmitter; kill: () => boolean } {
  return Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn(() => true) });
}

describe('git, for the commit', () => {
  it('runs git in the project, quietly, and trims what it says', () => {
    child.execFileSync.mockReturnValue('b59fa7d\n');
    expect(openProject('/p').commit()).toBe('b59fa7d');
    expect(child.execFileSync).toHaveBeenCalledWith('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: '/p',
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  });

  it('without git: none', () => {
    child.execFileSync.mockImplementation(() => {
      throw new Error('spawn git ENOENT');
    });
    expect(openProject('/p').commit()).toBe('none');
  });
});

describe('cloudflared, for the tunnel', () => {
  it('is launched hidden, with its output piped', async () => {
    const proc = fakeProcess();
    child.spawn.mockReturnValue(proc);
    const pending = openTunnel(4317);
    proc.stderr.emit('data', Buffer.from('https://x-y.trycloudflare.com'));
    expect(await pending).toMatchObject({ tunnel: { url: 'https://x-y.trycloudflare.com' } });
    expect(child.spawn).toHaveBeenCalledWith('cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:4317'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  });
});

describe('nodeDeps', () => {
  it('the folder it was started in, stdout and stderr', () => {
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const deps = nodeDeps();
    expect(deps.cwd).toBe(process.cwd());
    deps.out('to stdout');
    deps.err('to stderr');
    expect(out).toHaveBeenCalledWith('to stdout');
    expect(err).toHaveBeenCalledWith('to stderr');
  });

  it('the tunnel is cloudflared to that port', async () => {
    const proc = fakeProcess();
    child.spawn.mockReturnValue(proc);
    const pending = nodeDeps().tunnel(5000);
    proc.emit('exit', 1);
    expect(await pending).toEqual({ failed: 'cloudflared exited with 1:\n' });
    expect(child.spawn.mock.calls[0]![1]).toContain('http://127.0.0.1:5000');
  });

  it('Ctrl+C stops what it was given, then ends the process', () => {
    let onSigint: (() => void) | undefined;
    vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
      if (event === 'SIGINT') onSigint = handler;
      return process;
    }) as typeof process.once);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as unknown as typeof process.exit);
    const stop = vi.fn();
    nodeDeps().onStop(stop);
    expect(stop).not.toHaveBeenCalled();
    onSigint!();
    expect(stop).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });
});
