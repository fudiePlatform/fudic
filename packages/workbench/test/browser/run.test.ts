/**
 * Criterion 12 of BUG-48: `fudic-workbench run`, against a real Vite and a real browser — the
 * published binary on examples/basic, and `runMain` on throwaway projects.
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
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
      // SDD-64 §4.2: what the stock `text` says it looked for, and what it found.
      '        expected  contains "panel Z"',
      '        actual    "panel A"',
      expect.stringMatching(/^2 criteria · 1 pass · 1 fail · 0 error · [\d.]+ s · \w+$/u),
    ]);
  }, 120_000);

  it('with --json, every line is a v: 2 message, each result followed by its report, and the last one is the summary (SDD-64 criterion 4)', async () => {
    project = tempProject('run-json');
    project.write('src/components/app-tabs.fudspec', TABS_SPEC);
    const { lines, code } = await run(['--json', '--workers', '1'], project.root);
    expect(code).toBe(1);
    const messages = lines.map((l) => JSON.parse(l) as { v: number; type: string; tag?: string; id?: string; shots?: unknown });
    expect(messages.every((m) => m.v === 2)).toBe(true);
    expect(messages.map((m) => m.type)).toEqual(['session', 'running', 'result', 'report', 'result', 'report', 'summary']);
    // Each report is about the result right before it, and carries its tag (§8.2.6).
    for (const at of [2, 4]) {
      expect(messages[at + 1]).toMatchObject({ tag: 'app-tabs', id: messages[at]!.id });
    }
    // The messages from before do not change: `result` keeps its shape, and keeps no shots.
    for (const result of messages.filter((m) => m.type === 'result')) {
      expect(Object.keys(result).sort()).toEqual(['id', 'marks', 'ms', 'pageErrors', 'shots', 'steps', 'tag', 'type', 'v', 'verdict']);
      expect(result.shots).toEqual({});
    }
    expect(Object.keys(messages.at(-1)!).sort()).toEqual(['browser', 'error', 'fail', 'ms', 'pass', 'type', 'v']);
    expect(messages.at(-1)).toMatchObject({ type: 'summary', pass: 1, fail: 1, error: 0 });
    // The report is the CriterionReport as it is, after the message's own fields.
    const red = messages.find((m) => m.type === 'report' && m.id === 'roto') as Record<string, unknown>;
    expect(red).toMatchObject({ spec: 'src/components/app-tabs.fudspec', verdict: 'fail', failed: { expected: 'contains "panel Z"' } });
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

describe('runSpecs — SDD-64 criteria 1–3, the report of a criterion', () => {
  /** The red one is on line 7; its `then` on line 9, its term at column 5. */
  const SPEC_FILE = 'src/components/app-tabs.fudspec';
  const AFTER = '.fudic/runs/app-tabs/roto.after.png';

  async function reports() {
    const summary = await runSpecs([SPEC_FILE], { root: project!.root, workers: 2 });
    if (isFailure(summary)) throw new Error(summary.diagnostic.message);
    return summary.reports;
  }

  it('red with everything, the shot on disk; green without anything; fixed, the shot is gone', async () => {
    project = tempProject('run-report');
    project.write(SPEC_FILE, TABS_SPEC);

    const [green, red] = await reports();
    // In the order of the .fudspec, whatever order they finished in.
    expect([green?.id, red?.id]).toEqual(['empieza-en-a', 'roto']);

    // 1. Red: where the criterion is, the first red then with its line, expected and actual as text.
    expect(red).toMatchObject({
      spec: SPEC_FILE,
      id: 'roto',
      at: { file: SPEC_FILE, line: 7, column: 1 },
      verdict: 'fail',
      failed: {
        step: 'then  text role:tabpanel "panel Z"',
        at: { file: SPEC_FILE, line: 9, column: 5 },
        expected: 'contains "panel Z"',
        actual: '"panel A"',
      },
      pageErrors: [],
    });
    expect(red!.ms).toBeGreaterThanOrEqual(0);
    expect(red).not.toHaveProperty('broken');

    // 2. The shot on disk, named by the report; no `when`, so no `before`.
    expect(red!.shots).toEqual({ after: AFTER });
    expect(existsSync(project.path(AFTER))).toBe(true);
    expect(existsSync(project.path('.fudic/runs/app-tabs/roto.before.png'))).toBe(false);

    // 3. Green: none of what a red needs, and no shot on disk.
    expect(green).toMatchObject({ spec: SPEC_FILE, id: 'empieza-en-a', at: { file: SPEC_FILE, line: 3, column: 1 }, verdict: 'pass', pageErrors: [] });
    for (const key of ['failed', 'broken', 'source', 'shots']) expect(green).not.toHaveProperty(key);
    expect(existsSync(project.path('.fudic/runs/app-tabs/empieza-en-a.after.png'))).toBe(false);

    // 2. Fixed and run again: it passes, and its shot is gone.
    project.write(SPEC_FILE, TABS_SPEC.replace('"panel Z"', '"panel A"'));
    const [, fixed] = await reports();
    expect(fixed).toMatchObject({ id: 'roto', verdict: 'pass' });
    expect(fixed).not.toHaveProperty('shots');
    expect(existsSync(project.path(AFTER))).toBe(false);
  }, 180_000);
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
