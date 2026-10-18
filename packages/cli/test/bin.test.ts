/**
 * The binary: `run()`'s exit code onto the process, and a reader that stops reading —
 * `fudic --help | head` — is not an error of the CLI.
 */

import { afterAll, describe, expect, it, vi } from 'vitest';

const run = vi.hoisted(() => vi.fn(() => Promise.resolve(3)));
vi.mock('../src/run.js', () => ({ run }));

const before = process.stdout.listeners('error');
const exitCode = process.exitCode;
await import('../src/bin.js');
const onError = process.stdout.listeners('error').find((listener) => !before.includes(listener)) as (error: NodeJS.ErrnoException) => void;

afterAll(() => {
  process.stdout.off('error', onError);
  process.exitCode = exitCode;
});

describe('bin', () => {
  it('runs the command line and exits with its code', () => {
    expect(run).toHaveBeenCalledWith(process.argv.slice(2));
    expect(process.exitCode).toBe(3);
  });

  it('exits 0, with no stack trace, when the reader closes the pipe', () => {
    // A real exit does not return; this one stops the handler the same way.
    const exit = vi.spyOn(process, 'exit').mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as typeof process.exit);
    expect(() => onError(Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).toThrow('exit 0');
    exit.mockRestore();
  });

  it('lets any other error of stdout through', () => {
    expect(() => onError(Object.assign(new Error('write EIO'), { code: 'EIO' }))).toThrow('write EIO');
  });
});
