/** The binary: main with the arguments after the script and the real deps; its code, the exit code. */

import { afterEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ code: 0, argv: [] as readonly string[], deps: { real: true } }));

vi.mock('../src/main.js', () => ({
  main: (argv: readonly string[], deps: unknown) => {
    fake.argv = argv;
    expect(deps).toBe(fake.deps);
    return Promise.resolve(fake.code);
  },
  nodeDeps: () => fake.deps,
}));

const argv = process.argv;

afterEach(() => {
  process.argv = argv;
  process.exitCode = undefined;
  vi.resetModules();
});

describe('fudic-mcp', () => {
  it('passes the arguments, and leaves the exit code alone on success', async () => {
    process.argv = ['node', 'fudic-mcp', '--http', '--tunnel'];
    fake.code = 0;
    await import('../src/bin.js');
    expect(fake.argv).toEqual(['--http', '--tunnel']);
    expect(process.exitCode).toBeUndefined();
  });

  it('a failure becomes the exit code', async () => {
    process.argv = ['node', 'fudic-mcp', '--nope'];
    fake.code = 1;
    await import('../src/bin.js');
    expect(process.exitCode).toBe(1);
  });
});
