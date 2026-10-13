/**
 * The build's typecheck on a worker thread (`startBackgroundCheck`).
 *
 * The real script runs once, over a small project with a type error, so the thread is proven
 * to load the checker and hand back a report the main thread can read. The failure and the
 * cancel are driven by scripts of their own: a thread that throws, and one that never ends.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHECK_SCRIPT, startBackgroundCheck } from '../src/background-check.js';
import { writeTypecheckConfig } from './helpers/alias.js';

/** A worker script of the test's own, written to a temp folder. */
function script(source: string): URL {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-bgcheck-script-'));
  const file = join(dir, 'worker.mjs');
  writeFileSync(file, source);
  return pathToFileURL(file);
}

describe('startBackgroundCheck', () => {
  it('runs the real check on its own thread and hands back the report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-bgcheck-'));
    writeTypecheckConfig(root);
    mkdirSync(join(root, 'src', 'routes'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'routes', 'index.fud'),
      `@code {\n  const n: number = 'no';\n}\n<!DOCTYPE html><html><head><title>x</title></head><body>@n</body></html>\n`,
    );
    const check = startBackgroundCheck(root);
    const report = await check.report;
    expect(report.problems).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'TS2322', file: expect.stringMatching(/\/src\/routes\/index\.fud$/u) }),
    );
    // The thread is done: cancelling it now is harmless.
    await expect(check.cancel()).resolves.toBeUndefined();
  }, 120000);

  it('is the script one directory above `src`, next to the one above `dist`', () => {
    expect(CHECK_SCRIPT.href).toMatch(/\/worker\/check\.mjs$/u);
  });

  it('rejects with the error of a thread that fails — and an unread failure is not unhandled', async () => {
    const check = startBackgroundCheck('/nowhere', script(`throw new Error('the checker blew up');\n`));
    await expect(check.report).rejects.toThrow('the checker blew up');
  });

  it('cancel stops a thread that would never answer', async () => {
    const check = startBackgroundCheck('/nowhere', script(`setInterval(() => undefined, 1000);\n`));
    await expect(check.cancel()).resolves.toBeUndefined();
  });
});
