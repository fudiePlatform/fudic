/**
 * A child that could not be started: `fork` reports it as an `'error'` event (no executable,
 * no permission, out of handles), and nothing on the filesystem of a test can make the real
 * one fail that way. So `fork` is replaced here by a child that emits exactly that.
 */

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  fork: () => {
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    queueMicrotask(() => child.emit('error', new Error('spawn EACCES')));
    return child;
  },
}));

const { startBackgroundCheck } = await import('../src/background-check.js');

describe('startBackgroundCheck — the child could not be started', () => {
  it('rejects with the spawn error', async () => {
    await expect(startBackgroundCheck('/nowhere').report).rejects.toThrow('spawn EACCES');
  });
});
