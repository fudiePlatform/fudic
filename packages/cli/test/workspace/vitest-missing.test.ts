/**
 * BUG-51 — `fudic test` where the first project has no vitest installed: each project goes on
 * its own. Under pnpm the real lookup always finds the workspace's vitest (`NODE_PATH`), so the
 * resolver is the one thing replaced here, by one that finds nothing.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('node:module', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:module')>()),
  createRequire: () => ({
    resolve: () => {
      throw new Error("Cannot find module 'vitest/package.json'");
    },
  }),
}));

const { run } = await import('../../src/run.js');
const { captureStreams, MemoryFs, RecordingRunner } = await import('../helpers.js');

describe('fudic test with no vitest to share', () => {
  it('runs each project with its own script', async () => {
    const fs = new MemoryFs({}, '/w');
    const runner = new RecordingRunner();
    expect(await run(['new', 'shop', '--workspace', '--app', 'web', '--cwd', '/w'], { readIo: fs, writeIo: fs, runner, streams: captureStreams().streams })).toBe(0);

    const capture = captureStreams();
    const checks = new RecordingRunner();
    expect(await run(['test', '--cwd', '/w/shop'], { readIo: fs, writeIo: fs, runner: checks, streams: capture.streams })).toBe(0);
    expect(checks.commands.map((line) => line.replace(/ @ [A-Za-z]:/u, ' @ '))).toEqual(['pnpm --silent run test @ /w/shop/apps/web']);
    expect(capture.stdout()).toContain('▸ web  unit tests · apps/web\n');
  });
});
