/**
 * `nodeProcesses` (SDD-32 §4.10) against real processes: `node -e …` stands in for the
 * workbench, which is all the adapter knows of it — a first line, a stderr, an exit.
 */

import type { ChildProcess } from 'node:child_process';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

// The real spawn, with the last child kept: a dead pipe's error cannot be provoked on every
// platform from outside, so the test raises it on the child's stdin itself.
const spawned = vi.hoisted(() => ({ last: undefined as ChildProcess | undefined }));
vi.mock('node:child_process', async (original) => {
  const real = await original<typeof import('node:child_process')>();
  return {
    ...real,
    spawn: (...args: Parameters<typeof real.spawn>) => {
      spawned.last = real.spawn(...args);
      return spawned.last;
    },
  };
});

const { nodeProcesses } = await import('../src/spawn.js');

const NODE = process.execPath;
const run = (script: string) => nodeProcesses.spawn(NODE, ['-e', script], tmpdir());

const exited = (p: ReturnType<typeof run>): Promise<string> => new Promise((done) => p.onExit(done));

describe('nodeProcesses', () => {
  it('reads the first line of stdout, and the process lives on', async () => {
    const p = run(
      "process.stdout.write('{\"url\":\"u\",'); setTimeout(() => process.stdout.write('\"tag\":\"t\"}\\nsecond line\\n'), 20);" +
        "process.stdin.on('end', () => process.exit(0)); process.stdin.resume();",
    );
    expect(await p.firstLine).toBe('{"url":"u","tag":"t"}');
    const exit = exited(p);
    p.closeStdin();
    expect(await exit).toBe('');
  });

  it('gives what it printed without a newline when it exits, or undefined when it printed nothing', async () => {
    expect(await run("process.stdout.write('  no newline  ')").firstLine).toBe('no newline');
    expect(await run('process.exit(3)').firstLine).toBeUndefined();
  });

  it('runs in the folder it is given', async () => {
    const p = run("console.log(JSON.stringify(process.cwd()))");
    expect(JSON.parse((await p.firstLine)!)).toBe(tmpdir());
  });

  it('hands the tail of stderr to its exit listener', async () => {
    const p = run("process.stderr.write('x'.repeat(5000) + 'the end'); process.exit(1)");
    const stderr = await exited(p);
    expect(stderr).toHaveLength(2000);
    expect(stderr.endsWith('the end')).toBe(true);
  });

  it('rejects the first line with ENOENT for a command that does not exist', async () => {
    const p = nodeProcesses.spawn('definitely-not-a-node-binary', ['x'], tmpdir());
    await expect(p.firstLine).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('ignores closing the stdin of a process that is already gone', async () => {
    const p = run('process.exit(0)');
    await exited(p);
    expect(() => {
      p.closeStdin();
      p.closeStdin();
    }).not.toThrow();
    // A write error on the dead pipe would surface asynchronously, if it were not handled.
    await new Promise((done) => setTimeout(done, 50));
  });
});

describe('a broken stdin pipe', () => {
  it('is not news: its exit already says the process is gone', async () => {
    const p = run('process.exit(0)');
    await exited(p);
    const stdin = spawned.last!.stdin!;
    expect(() => stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).not.toThrow();
  });
});
