/**
 * The build's typecheck in a child process (`startBackgroundCheck`).
 *
 * The real script runs once, over a small project with a type error: the child loads the
 * checker and sends back a report this process can read. The rest is driven by scripts of the
 * test's own: one that answers, one that exits before answering, one that never ends.
 */

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { CHECK_SCRIPT, startBackgroundCheck as start, type BackgroundCheck } from '../src/background-check.js';
import { writeTypecheckConfig } from './helpers/alias.js';

/** A child script of the test's own, written to a temp folder. */
function script(source: string): URL {
  const dir = mkdtempSync(join(tmpdir(), 'fudic-bgcheck-script-'));
  const file = join(dir, 'child.mjs');
  writeFileSync(file, source);
  return pathToFileURL(file);
}

/** Every child a test starts, stopped before the next test: none outlives the file. */
const started: BackgroundCheck[] = [];
const startBackgroundCheck = (...args: Parameters<typeof start>): BackgroundCheck => {
  const check = start(...args);
  started.push(check);
  return check;
};

afterEach(async () => {
  await Promise.all(started.splice(0).map((check) => check.cancel()));
});

describe('startBackgroundCheck', () => {
  it('runs the real check in a child process and hands back the report', async () => {
    const root = mkdtempSync(join(tmpdir(), 'fudic-bgcheck-'));
    writeTypecheckConfig(root);
    mkdirSync(join(root, 'src', 'routes'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'routes', 'index.fud'),
      `@code {\n  const n: number = 'no';\n}\n<!DOCTYPE html><html><head><title>x</title></head><body>@n</body></html>\n`,
    );
    const report = await startBackgroundCheck(root).report;
    expect(report.problems).toContainEqual(
      expect.objectContaining({ severity: 'error', code: 'TS2322', file: expect.stringMatching(/\/src\/routes\/index\.fud$/u) }),
    );
  }, 120000);

  it('is the script one directory above `src`, next to the one above `dist`', () => {
    expect(CHECK_SCRIPT.href).toMatch(/\/worker\/check\.mjs$/u);
  });

  it('resolves with what the child sends, given the root it was started for', async () => {
    const check = startBackgroundCheck(
      '/the/project',
      script(`process.send({ problems: [], project: [], inputs: [process.argv[2]] }, () => process.disconnect());\n`),
    );
    await expect(check.report).resolves.toEqual({ problems: [], project: [], inputs: ['/the/project'] });
  });

  it('rejects with the exit code of a child that ends before it reports', async () => {
    const check = startBackgroundCheck('/nowhere', script(`process.exit(3);\n`));
    await expect(check.report).rejects.toThrow('the typecheck process ended before it reported (exit code 3)');
  });

  it('rejects when the checker throws in the child — a crash there is an exit code here', async () => {
    const check = startBackgroundCheck('/nowhere', script(`throw new Error('the checker blew up');\n`));
    await expect(check.report).rejects.toThrow('the typecheck process ended before it reported (exit code 1)');
  });

  it('cancel stops a child that would never answer, and the report says it was killed', async () => {
    const check = startBackgroundCheck('/nowhere', script(`setInterval(() => undefined, 1000);\n`));
    await expect(check.cancel()).resolves.toBeUndefined();
    await expect(check.report).rejects.toThrow(/the typecheck process ended before it reported \(SIG[A-Z]+\)/u);
  });
});
