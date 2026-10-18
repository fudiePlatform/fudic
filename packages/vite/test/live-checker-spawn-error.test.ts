/**
 * A live-check child that could not be started: `fork` reports it as an `'error'` event, and
 * nothing on the filesystem of a test can make the real one fail that way. So `fork` is replaced
 * here by a child that emits exactly that, before any check was asked or after one was.
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

const sent: unknown[] = [];

vi.mock('node:child_process', () => ({
  fork: () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn(), send: (m: unknown) => sent.push(m) });
    setTimeout(() => child.emit('error', new Error('spawn EACCES')), 5);
    return child;
  },
}));

const { startLiveChecker } = await import('../src/live-checker.js');

describe('startLiveChecker — the child could not be started', () => {
  it('rejects the pending check with the spawn error, and every one after it', async () => {
    const checker = startLiveChecker('/nowhere');
    await expect(checker.check()).rejects.toThrow('spawn EACCES');
    await expect(checker.check()).rejects.toThrow('spawn EACCES');
  });

  it('sends no invalidate to a child that is gone', async () => {
    const checker = startLiveChecker('/nowhere');
    await expect(checker.check()).rejects.toThrow('spawn EACCES');
    sent.length = 0;
    checker.invalidate('/nowhere/a.fud');
    expect(sent).toEqual([]);
  });
});
