/**
 * BUG-51 — `fudic test` in one vitest, on the disk: the lookup of the vitest a project
 * installed, and `runner/vitest-projects.mjs` running two projects for real.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { nodeReadIo, nodeWriteIo } from '../../src/io.js';
import { run } from '../../src/run.js';
import { captureStreams, RecordingRunner } from '../helpers.js';

const RUNNER = fileURLToPath(new URL('../../runner/vitest-projects.mjs', import.meta.url));
const VITEST_DIR = dirname(createRequire(import.meta.url).resolve('vitest/package.json'));
const VITEST = join(VITEST_DIR, 'dist', 'node.js');

const made: string[] = [];
const temp = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix)).replace(/\\/gu, '/');
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

describe('the vitest a project installed', () => {
  it('is found from the first project, and runs every project in one process', async () => {
    const root = temp('fudic-vp-ws-');
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    writeFileSync(join(root, 'package.json'), '{"name":"ws","private":true}');
    for (const name of ['web', 'admin']) {
      const app = join(root, 'apps', name);
      mkdirSync(join(app, 'node_modules'), { recursive: true });
      writeFileSync(join(app, 'fudic.json'), JSON.stringify({ id: name, kind: 'app', prefix: name }));
      writeFileSync(join(app, 'package.json'), JSON.stringify({ name, scripts: { test: 'vitest run' } }));
      symlinkSync(VITEST_DIR, join(app, 'node_modules', 'vitest'), 'junction');
    }
    const runner = new RecordingRunner();
    const capture = captureStreams();
    const code = await run(['test', '--cwd', root], { readIo: nodeReadIo(), writeIo: nodeWriteIo(), runner, streams: capture.streams });
    expect(code).toBe(0);
    expect(runner.commands).toHaveLength(1);
    const line = runner.commands[0]!.replace(/\\/gu, '/');
    expect(line).toContain('/runner/vitest-projects.mjs');
    expect(line).toContain('/vitest/dist/node.js');
    expect(capture.stdout()).toContain('unit tests · one vitest');
  });
});

describe('runner/vitest-projects.mjs', () => {
  /** Two projects, each with one test file whose test passes or not. */
  function projects(passes: readonly boolean[]): { root: string; dirs: string[] } {
    const root = temp('fudic-vp-run-');
    const dirs = passes.map((pass, i) => {
      const dir = join(root, `p${i}`).replace(/\\/gu, '/');
      mkdirSync(dir);
      writeFileSync(
        join(dir, 'one.test.mjs'),
        `import { expect, test } from 'vitest';\ntest('p${i}', () => { expect(${String(pass)}).toBe(true); });\n`,
      );
      writeFileSync(join(dir, 'vitest.config.mjs'), `export default { test: { name: 'p${i}' } };\n`);
      // The test files import vitest from where they are, as an app's do.
      mkdirSync(join(dir, 'node_modules'));
      symlinkSync(VITEST_DIR, join(dir, 'node_modules', 'vitest'), 'junction');
      return dir;
    });
    return { root, dirs };
  }

  const runIt = (root: string, dirs: readonly string[]) =>
    spawnSync(process.execPath, [RUNNER, VITEST, root, ...dirs], { cwd: root, encoding: 'utf8', timeout: 60_000 });

  it('runs every project and exits 0 when they all pass', () => {
    const { root, dirs } = projects([true, true]);
    const result = runIt(root, dirs);
    expect(result.status, result.stdout + result.stderr).toBe(0);
    // One run, both projects: one test file each.
    expect(result.stdout).toMatch(/Test Files\s+2 passed \(2\)/u);
  }, 60_000);

  it('exits 1 when a test of any of them fails', () => {
    const { root, dirs } = projects([true, false]);
    expect(runIt(root, dirs).status).toBe(1);
  }, 60_000);
});
