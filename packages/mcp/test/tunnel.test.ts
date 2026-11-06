/** `--tunnel` (criterion 3): cloudflared's quick tunnel, read from its output; never run for real here. */

import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { openTunnel, type Spawn } from '../src/tunnel.js';

class FakeChild extends EventEmitter {
  stdout: EventEmitter | null = new EventEmitter();
  stderr: EventEmitter | null = new EventEmitter();
  readonly kill = vi.fn(() => true);
}

function fake(setup?: (child: FakeChild) => void): { readonly start: Spawn; readonly child: FakeChild; readonly calls: [string, readonly string[]][] } {
  const child = new FakeChild();
  setup?.(child);
  const calls: [string, readonly string[]][] = [];
  const start: Spawn = (command, args) => {
    calls.push([command, args]);
    return child as unknown as ChildProcess;
  };
  return { start, child, calls };
}

const say = (stream: EventEmitter | null, text: string): boolean => stream!.emit('data', Buffer.from(text, 'utf8'));

describe('openTunnel', () => {
  it('starts the quick tunnel to the local port and reads the URL from stderr', async () => {
    const { start, child, calls } = fake();
    const pending = openTunnel(4317, start);
    say(child.stderr, 'INF Requesting new quick Tunnel on trycloudflare.com...\n');
    say(child.stderr, 'INF |  https://brave-otter-12.trycloudf');
    say(child.stderr, 'lare.com  |\n');
    const result = await pending;
    expect(calls).toEqual([['cloudflared', ['tunnel', '--no-autoupdate', '--url', 'http://127.0.0.1:4317']]]);
    if (!('tunnel' in result)) throw new Error('expected a tunnel');
    expect(result.tunnel.url).toBe('https://brave-otter-12.trycloudflare.com');
    expect(child.kill).not.toHaveBeenCalled();
    result.tunnel.close();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('reads it from stdout too, and settles once', async () => {
    const { start, child } = fake();
    const pending = openTunnel(5000, start);
    say(child.stdout, 'https://a-b.trycloudflare.com\n');
    say(child.stdout, 'https://c-d.trycloudflare.com\n');
    child.emit('exit', 0);
    expect(await pending).toEqual({ tunnel: { url: 'https://a-b.trycloudflare.com', close: expect.any(Function) } });
  });

  it('without cloudflared on the PATH: FUD1406, a warning', async () => {
    const { start, child } = fake();
    const pending = openTunnel(4317, start);
    child.emit('error', Object.assign(new Error('spawn cloudflared ENOENT'), { code: 'ENOENT' }));
    const result = await pending;
    if (!('missing' in result)) throw new Error('expected missing');
    expect(result.missing).toMatchObject({ code: 'FUD1406', severity: 'warning' });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('another error to start it: what it said', async () => {
    const { start, child } = fake();
    const pending = openTunnel(4317, start);
    child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }));
    expect(await pending).toEqual({ failed: 'spawn EACCES' });
  });

  it('it exits before saying a URL: its last words', async () => {
    const { start, child } = fake();
    const pending = openTunnel(4317, start);
    say(child.stderr, '  ERR failed to connect  \n');
    child.emit('exit', 1);
    expect(await pending).toEqual({ failed: 'cloudflared exited with 1:\nERR failed to connect' });
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it('keeps only the tail of a long output', async () => {
    const { start, child } = fake();
    const pending = openTunnel(4317, start);
    say(child.stderr, `${'x'.repeat(5000)}END`);
    child.emit('exit', null);
    const result = await pending;
    if (!('failed' in result)) throw new Error('expected failed');
    expect(result.failed).toBe(`cloudflared exited with null:\n${'x'.repeat(3997)}END`);
  });

  it('no URL in time: given up on, and stopped', async () => {
    vi.useFakeTimers();
    try {
      const { start, child } = fake((c) => {
        c.stdout = null;
        c.stderr = null;
      });
      const pending = openTunnel(4317, start, 2000);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await pending).toEqual({ failed: 'no URL after 2s:\n' });
      expect(child.kill).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
