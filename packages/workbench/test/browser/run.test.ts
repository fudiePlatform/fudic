/**
 * Criterion 12 of BUG-48: `fudic-workbench run`, against a real Vite and a real browser — the
 * published binary on examples/basic, and `runMain` on throwaway projects.
 */

import { execSync, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { findSpecs, runSpecs } from '../../src/run.js';
import { runMain } from '../../src/run-cli.js';
import { isFailure } from '../../src/types.js';
import { EXAMPLE } from '../helpers/bench.js';
import { tempProject, type TempProject } from '../helpers/project.js';

const PACKAGE = fileURLToPath(new URL('../..', import.meta.url));
const BIN = fileURLToPath(new URL('../../dist/bin.js', import.meta.url));

let project: TempProject | undefined;

afterEach(() => {
  project?.remove();
  project = undefined;
});

/** `runMain` in this process: what it printed and how it exited. */
async function run(argv: readonly string[], cwd: string): Promise<{ lines: string[]; code: number | undefined }> {
  const lines: string[] = [];
  let code: number | undefined;
  await runMain(argv, { cwd, write: (line) => void lines.push(line), exit: (c) => void (code = c) });
  return { lines, code };
}

const TABS_SPEC =
  'component app-tabs\n\ncriterion empieza-en-a\n  then\n    text role:tabpanel "panel A"\n\n' +
  'criterion roto\n  then\n    text role:tabpanel "panel Z"\n';

describe('the binary on examples/basic', () => {
  beforeAll(() => {
    execSync('pnpm build', { cwd: PACKAGE, stdio: 'ignore' });
  }, 120_000);

  it('exits 0 and prints the three criteria of app-card', async () => {
    const proc = spawn(process.execPath, [BIN, 'run'], { cwd: EXAMPLE });
    let out = '';
    proc.stdout.on('data', (chunk: Buffer) => (out += String(chunk)));
    const code = await new Promise<number | null>((done) => proc.on('exit', done));
    expect(code).toBe(0);
    const lines = out.split(/\r?\n/u);
    const card = lines.indexOf('app-card');
    expect(card).toBeGreaterThanOrEqual(0);
    expect(lines.slice(card + 1, card + 4).map((l) => l.replace(/\s+\d+ ms$/u, '').trim())).toEqual([
      '✓ altura-minima',
      '✓ titulo-largo-visible',
      '✓ destacada-al-cambiar-variante',
    ]);
    expect(lines.filter((l) => l !== '').at(-1)).toMatch(/^\d+ criteria · \d+ pass · 0 fail · 0 error · [\d.]+ s · \w+$/u);
  }, 120_000);
});

describe('runMain on a project — criterion 12', () => {
  it('with a broken criterion exits 1 and shows expected against actual', async () => {
    project = tempProject('run-broken');
    project.write('src/components/app-tabs.fudspec', TABS_SPEC);
    const { lines, code } = await run([], project.root);
    expect(code).toBe(1);
    expect(lines).toEqual([
      'app-tabs',
      expect.stringMatching(/^ {2}✓ empieza-en-a {2}\d+ ms$/u),
      expect.stringMatching(/^ {2}✗ roto {10}\d+ ms$/u),
      '      then role:tabpanel says "panel Z"',
      '        expected  panel Z',
      '        actual    panel A',
      expect.stringMatching(/^2 criteria · 1 pass · 1 fail · 0 error · [\d.]+ s · \w+$/u),
    ]);
  }, 120_000);

  it('with --json, every line is a v: 2 message and the last one is the summary', async () => {
    project = tempProject('run-json');
    project.write('src/components/app-tabs.fudspec', TABS_SPEC);
    const { lines, code } = await run(['--json', '--workers', '1'], project.root);
    expect(code).toBe(1);
    const messages = lines.map((l) => JSON.parse(l) as { v: number; type: string; shots?: unknown });
    expect(messages.every((m) => m.v === 2)).toBe(true);
    expect(messages.map((m) => m.type)).toEqual(['session', 'running', 'result', 'result', 'summary']);
    // `run` keeps no shots: nothing would serve them once it exits.
    expect(messages.filter((m) => m.type === 'result').map((m) => m.shots)).toEqual([{}, {}]);
    expect(messages.at(-1)).toMatchObject({ type: 'summary', pass: 1, fail: 1, error: 0 });
  }, 120_000);

  it('without anything to run, FUD0976 and exit 1', async () => {
    project = tempProject('run-empty');
    mkdirSync(project.path('public'), { recursive: true });
    const { lines, code } = await run(['public'], project.root);
    expect(code).toBe(1);
    expect(lines).toEqual([expect.stringMatching(/^error FUD0976 .*public/u)]);
    const none = await runSpecs([], { root: project.path('public') });
    expect(isFailure(none) && none.diagnostic.code).toBe('FUD0976');
    // Without a root, the current folder: this package has no .fudspec outside its hidden ones.
    const here = await runSpecs([]);
    expect(isFailure(here) && here.diagnostic.message).toContain(process.cwd().replaceAll('\\', '/'));
  }, 60_000);

  it('a page is an error, a .fud without .fudspec is skipped with FUD0972, a .fudspec with errors is an error', async () => {
    project = tempProject('run-mixed');
    project.write('src/index.fud', '<!DOCTYPE html>\n<html><body></body></html>\n');
    project.write('src/components/app-tabs.fudspec', 'component app-tabs\n\ncriterion roto\n  then\n    no-such-term app-tabs\n');
    const diagnostics: string[] = [];
    const done: string[] = [];
    const summary = await runSpecs(['src/index.fud', 'src/components/app-frame.fud', 'src/components/app-tabs.fud'], {
      root: project.root,
      onDiagnostic: (d) => diagnostics.push(d.code),
      onDone: (tag) => done.push(tag),
    });
    if (isFailure(summary)) throw new Error(summary.diagnostic.message);
    expect(diagnostics).toEqual(['FUD0970', 'FUD0972']);
    expect(done).toEqual(['app-tabs']);
    expect(summary).toMatchObject({ pass: 0, fail: 0, error: 2, results: [] });
    expect(summary.browser).toMatch(/^(chrome|msedge|chromium)$/u);
  }, 120_000);
});

describe('findSpecs', () => {
  it('finds every .fudspec under a folder, sorted, and skips node_modules, dist and hidden folders', () => {
    project = tempProject('find');
    for (const path of ['b/x.fudspec', 'a/y.fudspec', 'node_modules/m/z.fudspec', 'dist/d.fudspec', '.cache/c.fudspec', 'a/note.md']) {
      mkdirSync(project.path(path.replace(/\/[^/]+$/u, '')), { recursive: true });
      project.write(path, '');
    }
    const found = findSpecs(project.root).map((p) => p.replace(/\\/gu, '/').slice(project!.root.length + 1));
    expect(found).toEqual(['a/y.fudspec', 'b/x.fudspec']);
  });
});
