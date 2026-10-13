/**
 * The build's typecheck on a worker thread (`startBackgroundCheck`).
 *
 * The real check runs in a Node process of its own, over a small project with a type error: it
 * proves the thread loads the checker and hands back a report the main thread can read. It does
 * not run in this file's own process on purpose — a thread that loads TypeScript, Volar and the
 * native Oxc addon inside vitest's fork, under the load of the whole suite, brought that fork
 * down now and then ("Worker exited unexpectedly"), while the same thread never brought down a
 * plain Node process, cancelled or not. What runs here are threads of the test's own: one that
 * answers, one that throws, one that never ends.
 */

import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import type { CheckReport } from '@fudic/typecheck/problems';
import { CHECK_SCRIPT, startBackgroundCheck as start, type BackgroundCheck } from '../src/background-check.js';
import { writeTypecheckConfig } from './helpers/alias.js';

/** A script of the test's own, written to a temp folder. */
function script(source: string, name = 'worker.mjs'): URL {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-bgcheck-script-'));
  const file = join(dir, name);
  writeFileSync(file, source);
  return pathToFileURL(file);
}

/** Every thread a test starts, stopped — and exited — before the test is over. */
const started: BackgroundCheck[] = [];
const startBackgroundCheck = (...args: Parameters<typeof start>): BackgroundCheck => {
  const check = start(...args);
  started.push(check);
  return check;
};

afterEach(async () => {
  // `terminate()` resolves once the thread has exited, whether it was running, failing or done.
  await Promise.all(started.splice(0).map((check) => check.cancel()));
});

describe('startBackgroundCheck', () => {
  it('runs the real check on its own thread and hands back the report — in a process of its own', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-bgcheck-'));
    writeTypecheckConfig(root);
    mkdirSync(join(root, 'src', 'routes'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'routes', 'index.fud'),
      `@code {\n  const n: number = 'no';\n}\n<!DOCTYPE html><html><head><title>x</title></head><body>@n</body></html>\n`,
    );
    // Node strips the types of `src/background-check.ts` itself; the thread it starts is the
    // real `worker/check.mjs`, as in a build.
    const driver = script(
      [
        `const { startBackgroundCheck } = await import(process.argv[2]);`,
        `const check = startBackgroundCheck(process.argv[3]);`,
        `const report = await check.report;`,
        `await check.cancel();`,
        `process.stdout.write(JSON.stringify(report));`,
      ].join('\n'),
      'driver.mjs',
    );
    const source = new URL('../src/background-check.ts', import.meta.url).href;
    const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(driver), source, root], {
      maxBuffer: 16 * 1024 * 1024,
    }).catch((error: Error & { code?: unknown; stdout?: string; stderr?: string }) => {
      // What the process said is the only clue to why it failed: keep it in the message.
      throw new Error(`${error.message}\ncode=${String(error.code)} stdout=${String(error.stdout).slice(0, 300)}\nstderr=${error.stderr ?? ''}`);
    });
    const report = JSON.parse(stdout) as CheckReport;
    expect(report.problems).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'TS2322', file: expect.stringMatching(/\/src\/routes\/index\.fud$/u) }),
    );
  }, 120000);

  it('is the script one directory above `src`, next to the one above `dist`', () => {
    expect(CHECK_SCRIPT.href).toMatch(/\/worker\/check\.mjs$/u);
  });

  it('resolves with what the thread posts, given the root it was started for', async () => {
    const check = startBackgroundCheck(
      '/the/project',
      script(
        `import { parentPort, workerData } from 'node:worker_threads';\n` +
          `parentPort.postMessage({ problems: [], project: [], inputs: [workerData.root] });\n`,
      ),
    );
    await expect(check.report).resolves.toEqual({ problems: [], project: [], inputs: ['/the/project'] });
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
