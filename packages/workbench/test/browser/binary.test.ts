/**
 * Criterion 22: the real binary, built and spawned as the editor will spawn it. One JSON line,
 * alive until stdin closes, and then nothing left behind — no Chrome, no folder.
 */

import { execFileSync, execSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { tempProject, type TempProject } from '../helpers/project.js';

const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const BIN = fileURLToPath(new URL('../../dist/bin.js', import.meta.url));
const TABS = 'src/components/app-tabs.fud';

let project: TempProject | undefined;
let child: ChildProcessWithoutNullStreams | undefined;

beforeAll(() => {
  // The binary is what is published: build it from the sources under test.
  execSync('pnpm build', { cwd: PACKAGE, stdio: 'ignore' });
}, 120_000);

afterEach(() => {
  child?.kill();
  child = undefined;
  project?.remove();
  project = undefined;
});

interface Launched {
  readonly line: Record<string, unknown>;
  readonly exited: Promise<number | null>;
}

function launch(args: readonly string[]): Promise<Launched> {
  const proc = spawn(process.execPath, [BIN, ...args], { cwd: project?.root ?? PACKAGE });
  child = proc;
  const exited = new Promise<number | null>((done) => proc.on('exit', done));
  return new Promise((done, fail) => {
    let out = '';
    let err = '';
    proc.stderr.on('data', (chunk: Buffer) => (err += String(chunk)));
    proc.stdout.on('data', (chunk: Buffer) => {
      out += String(chunk);
      const end = out.indexOf('\n');
      if (end >= 0) done({ line: JSON.parse(out.slice(0, end)) as Record<string, unknown>, exited });
    });
    void exited.then((code) => fail(new Error(`exited ${code} before a line; stderr: ${err}`)));
  });
}

/** The command lines of the processes whose parent is `pid`. */
function children(pid: number): string[] {
  const out =
    process.platform === 'win32'
      ? execFileSync(
          'powershell',
          ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${pid}" | ForEach-Object { $_.CommandLine }`],
          { encoding: 'utf8' },
        )
      : execFileSync('ps', ['-o', 'args=', '--ppid', String(pid)], { encoding: 'utf8' });
  return out.split(/\r?\n/u).filter((line) => line.trim() !== '');
}

/** Whether any process is still running with this text in its command line. */
function running(text: string): boolean {
  const out =
    process.platform === 'win32'
      ? execFileSync(
          'powershell',
          ['-NoProfile', '-Command', 'Get-CimInstance Win32_Process | ForEach-Object { $_.CommandLine }'],
          { encoding: 'utf8' },
        )
      : execFileSync('ps', ['-eo', 'args='], { encoding: 'utf8' });
  return out.includes(text);
}

describe('the binary — criterion 22', () => {
  it('prints the JSON line and lives; closing stdin closes Chrome and deletes the folder', async () => {
    project = tempProject('bin');
    const { line, exited } = await launch([project.path(TABS)]);
    expect(line).toEqual({
      url: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/__bench\/$/u) as unknown,
      tag: 'app-tabs',
      component: project.path(TABS),
      criteria: 1,
    });
    expect((await fetch(String(line['url']))).status).toBe(200);
    expect(existsSync(project.path('node_modules/.fudic-bench/app-tabs'))).toBe(true);

    // Playwright's Chrome is a child of the binary, with a profile folder of its own.
    const chrome = children(child!.pid!).find((c) => /chrome/iu.test(c));
    expect(chrome).toBeDefined();
    const profile = /--user-data-dir=("[^"]+"|\S+)/u.exec(chrome!)![1]!;

    child!.stdin.end();
    expect(await exited).toBe(0);
    expect(existsSync(project.path('node_modules/.fudic-bench'))).toBe(false);
    await expect.poll(() => running(profile), { timeout: 10_000 }).toBe(false);
  }, 90_000);

  it('with --keep, leaves the folder of pages', async () => {
    project = tempProject('bin-keep');
    const { exited } = await launch([TABS, '--keep', '--port', '0']);
    child!.stdin.end();
    expect(await exited).toBe(0);
    expect(existsSync(project.path('node_modules/.fudic-bench/app-tabs/routes/app-tabs.fud'))).toBe(true);
  }, 90_000);

  it('with a page, an error line with FUD0970 and exit code 1', async () => {
    project = tempProject('bin-page');
    project.write('src/index.fud', '<!DOCTYPE html>\n<html><body></body></html>\n');
    const { line, exited } = await launch([project.path('src/index.fud')]);
    expect(line).toEqual({
      error: { code: 'FUD0970', message: expect.stringContaining('is not a component with a tag') as unknown },
    });
    expect(await exited).toBe(1);
  }, 30_000);

  it('without a file, the usage as an error line and exit code 1', async () => {
    const { line, exited } = await launch([]);
    expect(line).toEqual({ error: { message: 'usage: fudic-workbench <file> [--port <n>] [--keep]' } });
    expect(await exited).toBe(1);
  }, 30_000);
});
