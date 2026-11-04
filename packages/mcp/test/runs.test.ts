/**
 * `fudic_test` and `fudic_spec_run` (SDD-77 §4.8, criteria 24 and 25) over an app of `fudic new`.
 * The runners are the project's — vitest and a browser — and are answered here with the reports
 * they give: what the tools do with them is what is tested. The history and the phases are real.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestReport } from '@fudic/testing/run';
import type { CriterionReport, RunSummary } from '@fudic/workbench';
import { FUD0972, FUD0973 } from '@fudic/diagnostics';
import { toPosix } from '@fudic/typecheck';
import { Checks } from '../src/checks.js';
import { loadRunners, type Runners } from '../src/fudic.js';
import { unitsOf } from '../src/phases.js';
import { openProject, type Project } from '../src/project.js';
import { recordEvent } from '../src/record.js';
import type { Answer } from '../src/respond.js';
import { mergedTests, RunQueue, runSpecsTool, runTestsTool, targetsOf, type RunsDeps } from '../src/runs.js';
import { connect, newApp, tempDir } from './helpers.js';
import { createServer } from '../src/server.js';

const BADGE = 'src/components/app-badge/app-badge.fud';
const TEST = 'src/components/app-badge/app-badge.test.ts';
const SPEC = 'src/components/app-badge/app-badge.fudspec';

let app: { readonly root: string; dispose(): void };
let project: Project;
let checks: Checks;
const queue = new RunQueue();

beforeAll(async () => {
  app = await newApp();
  project = openProject(app.root, () => 'b59fa7d');
  checks = new Checks(app.root);
  const { cli } = await checks.fudic();
  const command = cli.parseArgs(['g', 'component', 'app-badge', '--cwd', app.root]);
  const io = { readIo: cli.nodeReadIo(), writeIo: cli.nodeWriteIo(), runner: { run: () => 0 }, streams: { out: () => undefined, err: () => undefined } };
  const plan = await cli.planOf(command as never, io);
  await cli.apply(plan, (command as unknown as { opts: never }).opts, cli.nodeWriteIo());
  expect((await recordEvent(project, checks, { piece: BADGE, event: 'approved' })).failed).toBeUndefined();
}, 120_000);

afterAll(() => app.dispose());

/** The phase of app-badge, as status would read it. */
async function phase(): Promise<string | undefined> {
  return (await unitsOf(app.root, await checks.service(), { showcase: async () => true })).find((u) => u.piece === BADGE)?.phase;
}

const pos = (file: string, line: number): { file: string; line: number; column: number } => ({ file, line, column: 3 });

function testReport(over: { fail?: number; broken?: number; pass?: number; file?: string }): TestReport {
  const { fail = 0, broken = 0, pass = 0, file = TEST } = over;
  const tests: TestReport['tests'] = [
    ...Array.from({ length: fail }, (_, i) => ({
      verdict: 'fail' as const,
      file,
      name: `app-badge > case ${i}`,
      at: pos(file, 5 + i),
      quote: 'expect(t.host).toHaveTextContent("3");',
      message: 'expected "" to have text "3"',
      ...(i === 0 ? { expected: '"3"', actual: '""' } : {}),
    })),
    ...Array.from({ length: broken }, (_, i) =>
      i === 0
        ? { verdict: 'broken' as const, file, name: null, diagnostics: [{ code: 'FUD1207', severity: 'error', message: 'did not load', file: null, line: null, column: null }] as never }
        : {
            verdict: 'broken' as const,
            file,
            name: `app-badge > threw ${i}`,
            at: pos(file, 9),
            quote: 'mount(AppBadge)',
            diagnostics: [
              { code: 'FUD0540', severity: 'error', message: 'key', file: BADGE, line: 4, column: null },
              { code: 'FUD0540', severity: 'error', message: 'key', file: BADGE, line: null, column: null },
            ] as never,
          },
    ),
  ];
  return { summary: { pass, fail, broken, skipped: 0 }, tests, files: [{ file, pass, fail, broken, skipped: 0 }], ms: 12 };
}

/** Runners that answer `report`, and remember what they were asked. */
function runnersOf(answers: { tests?: TestReport; specs?: RunSummary | { diagnostic: never }; problems?: readonly never[] }): RunsDeps & { asked: unknown[] } {
  const asked: unknown[] = [];
  const runners: Runners = {
    runTests: async (options) => {
      asked.push(options);
      return answers.tests!;
    },
    runSpecs: async (paths, options) => {
      asked.push({ paths, ...options, onDiagnostic: typeof options?.onDiagnostic });
      for (const problem of answers.problems ?? []) options?.onDiagnostic?.(problem);
      return answers.specs!;
    },
  } as Runners;
  return { runners: async () => runners, asked };
}

function criterion(over: Partial<CriterionReport>): CriterionReport {
  return { spec: SPEC, id: 'shows-the-count', at: pos(SPEC, 3), verdict: 'pass', ms: 5, pageErrors: [], ...over };
}

function summary(reports: readonly CriterionReport[]): RunSummary {
  const count = (v: string): number => reports.filter((r) => r.verdict === v).length;
  return { pass: count('pass'), fail: count('fail'), error: count('error'), ms: 30, browser: 'chromium', results: [], reports } as RunSummary;
}

const codes = (answer: Answer): unknown => answer.diagnostics?.map((d) => d.code);

describe('fudic_test (criteria 24 and 25)', { timeout: 60_000 }, () => {
  it('in the red phase: a failing test is fail, with expected and got; the run is in the history and the phase moves on', async () => {
    expect(await phase()).toBe('red');
    const deps = runnersOf({ tests: testReport({ fail: 2 }) });
    const answer = await runTestsTool(project, checks, queue, { failing: false }, deps);
    expect(answer.body['summary']).toEqual({ pass: 0, fail: 2, broken: 0, skipped: 0 });
    expect(answer.body['tests']).toEqual([
      { verdict: 'fail', file: TEST, name: 'app-badge > case 0', at: `${TEST}:5:3`, quote: 'expect(t.host).toHaveTextContent("3");', message: 'expected "" to have text "3"', expected: '"3"', got: '""' },
      { verdict: 'fail', file: TEST, name: 'app-badge > case 1', at: `${TEST}:6:3`, quote: 'expect(t.host).toHaveTextContent("3");', message: 'expected "" to have text "3"' },
    ]);
    expect(deps.asked).toEqual([{ root: app.root, failing: false }]);
    // Red tests, criteria not run yet: still red, and next asks for the right reason.
    expect(answer.next).toBe(`Every test of ${BADGE} must fail for the right reason: an assertion that says no, not one that breaks. Then run fudic_spec_run.`);
  });

  it('a broken test is not red: its diagnostics in the shape of every answer, and next says to fix it', async () => {
    const answer = await runTestsTool(project, checks, queue, { failing: false }, runnersOf({ tests: testReport({ broken: 2 }) }));
    expect(answer.body['tests']).toEqual([
      { verdict: 'broken', file: TEST, name: null, diagnostics: [{ code: 'FUD1207', severity: 'error', message: 'did not load' }] },
      {
        verdict: 'broken',
        file: TEST,
        name: 'app-badge > threw 1',
        at: `${TEST}:9:3`,
        quote: 'mount(AppBadge)',
        diagnostics: [
          { code: 'FUD0540', severity: 'error', message: 'key', at: `${BADGE}:4:1` },
          { code: 'FUD0540', severity: 'error', message: 'key', at: BADGE },
        ],
      },
    ]);
    expect(answer.next).toMatch(/^Every test must fail for the right reason: a broken test is not red/u);
    expect(await phase()).toBe('red');
  });

  it('failing: only what was red, and the paths and names asked, passed to the runner', async () => {
    const deps = runnersOf({ tests: testReport({ fail: 1 }) });
    await runTestsTool(project, checks, queue, { failing: true, paths: ['src/components'], names: ['case'] }, deps);
    expect(deps.asked).toEqual([{ root: app.root, paths: [join(app.root, 'src/components')], names: ['case'], failing: true }]);
  });

  it('a run narrowed to other files speaks only of them: nothing of app-badge', async () => {
    const answer = await runTestsTool(project, checks, queue, { failing: false, paths: ['src/services'] }, runnersOf({ tests: testReport({ fail: 1, file: 'src/services/x.test.ts' }) }));
    expect(answer.next).toBeNull();
  });

  it('a path out of the project: FUD1400; without @fudic/testing: FUD1207', async () => {
    expect(codes(await runTestsTool(project, checks, queue, { failing: false, paths: ['../x'] }, runnersOf({})))).toEqual(['FUD1400']);
    const none: RunsDeps = { runners: async () => ({}) };
    const answer = await runTestsTool(project, checks, queue, { failing: false }, none);
    expect(codes(answer)).toEqual(['FUD1207']);
    expect(answer.failed).toBe(true);
  });
});

describe('fudic_spec_run (criteria 24 and 25)', { timeout: 60_000 }, () => {
  it('the step in red, with expected, got, source and quote; the shot; the run in the history, and the phase moves on', async () => {
    const reports = [
      criterion({}),
      criterion({
        id: 'counts',
        at: pos(SPEC, 7),
        verdict: 'fail',
        failed: { step: 'then  the badge says 3', at: pos(SPEC, 9), expected: '"3"', actual: '""' },
        source: { at: pos(BADGE, 12), quote: '<span class="count">' },
        shots: { before: '.fudic/runs/b.png', after: '.fudic/runs/a.png' },
        pageErrors: ['TypeError: x'],
      }),
    ];
    const deps = runnersOf({ specs: summary(reports) });
    const answer = await runSpecsTool(project, checks, queue, { failing: false, spec: 'app-badge' }, deps);
    expect(answer.body).toMatchObject({ summary: { pass: 1, fail: 1, error: 0 }, browser: 'chromium', ms: 30 });
    expect(answer.body['criteria']).toEqual([
      {
        spec: SPEC,
        id: 'counts',
        verdict: 'fail',
        at: `${SPEC}:7:3`,
        step: 'then  the badge says 3',
        stepAt: `${SPEC}:9:3`,
        expected: '"3"',
        got: '""',
        source: `${BADGE}:12:3`,
        quote: '<span class="count">',
        shot: '.fudic/runs/a.png',
        pageErrors: ['TypeError: x'],
      },
    ]);
    // The .fudspec of the piece, as the project service names its file.
    expect(deps.asked).toEqual([{ paths: [toPosix(join(app.root, SPEC))], root: app.root, failing: false, onDiagnostic: 'function' }]);
    // Tests red (the last test run of app-badge), criteria fail: the red phase is done.
    expect(await phase()).toBe('view');
    expect(answer.next).toBe(`Make the view of ${BADGE} pass these criteria. Do not change the .fudspec.`);
  });

  it('a criterion that errors: its step and diagnostics; a source outside the project is not shown; the shot before', async () => {
    const reports = [
      criterion({
        verdict: 'error',
        broken: { step: 'when  click', diagnostics: [{ code: 'FUD0973', severity: 'error', message: 'threw', file: SPEC, line: 4, column: 2 }] as never },
        source: { at: pos('node_modules/.fudic-bench/host.fud', 1), quote: '<host>' },
        shots: { before: '.fudic/runs/b.png' },
      }),
      criterion({ id: 'quiet', verdict: 'error', broken: { diagnostics: [] }, source: { at: pos('../elsewhere.fud', 1), quote: '<x>' }, shots: {} }),
    ];
    const answer = await runSpecsTool(project, checks, queue, { failing: true, criteria: ['shows-the-count'] }, runnersOf({ specs: summary(reports), problems: [FUD0972({ file: BADGE }) as never] }));
    expect(answer.body['criteria']).toEqual([
      { spec: SPEC, id: 'shows-the-count', verdict: 'error', at: `${SPEC}:3:3`, step: 'when  click', diagnostics: [{ code: 'FUD0973', severity: 'error', message: 'threw', at: `${SPEC}:4:2` }], shot: '.fudic/runs/b.png' },
      { spec: SPEC, id: 'quiet', verdict: 'error', at: `${SPEC}:3:3`, diagnostics: [] },
    ]);
    expect(codes(answer)).toEqual(['FUD0972']);
    expect(answer.next).toBe('A criterion that errors did not say pass or fail: fix what its diagnostics say, then run fudic_spec_run again.');
  });

  it('red tests and failing criteria in the red phase; nothing left in red or view: next is null', async () => {
    const fresh = tempDir();
    try {
      // In the view phase, a test run that is still red says to write the view, not the tests.
      const failed = { step: 'then  x', at: pos(SPEC, 4), expected: '1', actual: '0' };
      await runSpecsTool(project, checks, queue, { failing: false, spec: SPEC }, runnersOf({ specs: summary([criterion({ verdict: 'fail', failed })]) }));
      const red = await runTestsTool(project, checks, queue, { failing: false }, runnersOf({ tests: testReport({ fail: 1 }) }));
      expect(red.next).toBe(`Make the view of ${BADGE} pass these tests. Do not change the tests.`);
      // The view of app-badge passes: tests and criteria pass, and it goes to its doc.
      await runTestsTool(project, checks, queue, { failing: false }, runnersOf({ tests: testReport({ pass: 2 }) }));
      const answer = await runSpecsTool(project, checks, queue, { failing: false, spec: SPEC }, runnersOf({ specs: summary([criterion({})]) }));
      expect(answer.body['criteria']).toEqual([]);
      expect(await phase()).not.toMatch(/^(criteria|red|view)$/u);
      expect(answer.next).toBeNull();
    } finally {
      fresh.dispose();
    }
  });

  it('failing criteria while the tests are broken: still red, and next says so', async () => {
    await runTestsTool(project, checks, queue, { failing: false }, runnersOf({ tests: testReport({ broken: 1 }) }));
    const failed = { step: 'then  x', at: pos(SPEC, 4), expected: '1', actual: '0' };
    const answer = await runSpecsTool(project, checks, queue, { failing: false, spec: SPEC }, runnersOf({ specs: summary([criterion({ verdict: 'fail', failed })]) }));
    expect(await phase()).toBe('red');
    expect(answer.next).toBe(`Every criterion of ${BADGE} must fail for the right reason. Then write its view.`);
  });

  it('a spec the runner says it could not run: its diagnostic, nothing recorded', async () => {
    const answer = await runSpecsTool(project, checks, queue, { failing: false }, runnersOf({ specs: { diagnostic: FUD0973({ file: SPEC, step: 'x', reason: 'no browser' } as never) as never } }));
    expect(answer.failed).toBe(true);
    expect(codes(answer)).toEqual(['FUD0973']);
  });

  it('a spec that names nothing — no piece, no file, or out of the project: FUD1405', async () => {
    for (const spec of ['app-nope', 'src/nope.fudspec', '../x.fudspec']) {
      const answer = await runSpecsTool(project, checks, queue, { failing: false, spec }, runnersOf({}));
      expect(codes(answer), spec).toEqual(['FUD1405']);
    }
  });

  it('without @fudic/workbench: FUD1207', async () => {
    expect(codes(await runSpecsTool(project, checks, queue, { failing: false }, { runners: async () => ({}) }))).toEqual(['FUD1207']);
  });
});

describe('outside a project', () => {
  it('both: FUD1404', async () => {
    const dir = tempDir();
    try {
      mkdirSync(join(dir.root, 'src'));
      const outside = openProject(dir.root);
      const deps = runnersOf({});
      expect(codes(await runTestsTool(outside, new Checks(dir.root), queue, { failing: false }, deps))).toEqual(['FUD1404']);
      expect(codes(await runSpecsTool(outside, new Checks(dir.root), queue, { failing: false }, deps))).toEqual(['FUD1404']);
    } finally {
      dir.dispose();
    }
  });
});

describe('RunQueue', () => {
  it('one run at a time, in order; one that fails does not stop the next', async () => {
    const runs = new RunQueue();
    const order: string[] = [];
    let release: () => void = () => undefined;
    const first = runs.run(() => new Promise<void>((done) => (release = () => (order.push('first'), done()))));
    const failing = runs.run(async () => {
      order.push('failing');
      throw new Error('broke');
    });
    const last = runs.run(async () => order.push('last'));
    await Promise.resolve();
    expect(order).toEqual([]);
    release();
    await first;
    await expect(failing).rejects.toThrow('broke');
    await last;
    expect(order).toEqual(['first', 'failing', 'last']);
  });
});

describe('the runners the project installed', () => {
  it('a fudic project without @fudic/testing or @fudic/workbench: both tools say what to install (FUD1207)', async () => {
    const dir = tempDir({ 'fudic.json': '{}' });
    try {
      const bare = openProject(dir.root);
      // No deps given: the runners are looked for in the project's own node_modules.
      expect(codes(await runTestsTool(bare, new Checks(dir.root), queue, { failing: false }))).toEqual(['FUD1207']);
      expect(codes(await runSpecsTool(bare, new Checks(dir.root), queue, { failing: false }))).toEqual(['FUD1207']);
    } finally {
      dir.dispose();
    }
  });

  it('loadRunners: each one from its package, by the file it exports', async () => {
    const dir = tempDir();
    try {
      for (const [name, exports] of [
        ['testing', { './run': { import: './run.js' } }],
        ['workbench', { '.': { import: './index.js' } }],
      ] as const) {
        mkdirSync(join(dir.root, 'node_modules/@fudic', name), { recursive: true });
        writeFileSync(join(dir.root, 'node_modules/@fudic', name, 'package.json'), JSON.stringify({ name: `@fudic/${name}`, exports }));
      }
      const runTests = (): void => undefined;
      const runSpecs = (): void => undefined;
      const loaded: string[] = [];
      const runners = await loadRunners(dir.root, async (url) => {
        loaded.push(url.slice(url.lastIndexOf('/') + 1));
        return url.endsWith('run.js') ? { runTests } : { runSpecs };
      });
      expect(runners).toEqual({ runTests, runSpecs });
      expect(loaded).toEqual(['run.js', 'index.js']);
    } finally {
      dir.dispose();
    }
  });

  it('loadRunners: a package that exports no runner is as if it were not there', async () => {
    const dir = tempDir();
    try {
      mkdirSync(join(dir.root, 'node_modules/@fudic/testing'), { recursive: true });
      writeFileSync(join(dir.root, 'node_modules/@fudic/testing/package.json'), JSON.stringify({ name: '@fudic/testing', exports: {} }));
      expect(await loadRunners(dir.root, async () => ({}))).toEqual({});
    } finally {
      dir.dispose();
    }
  });
});

describe('over a client', () => {
  it('fudic_test and fudic_spec_run take their options from the call', async () => {
    const dir = tempDir({ 'fudic.json': '{}' });
    try {
      const client = await connect(createServer({ project: openProject(dir.root, () => 'b59fa7d'), entry: 'stdio' }));
      const answer = async (name: string, args: Record<string, unknown>): Promise<unknown> =>
        ((await client.callTool({ name, arguments: args })).structuredContent as { diagnostics: { code: string }[] }).diagnostics.map((d) => d.code);
      expect(await answer('fudic_test', {})).toEqual(['FUD1207']);
      expect(await answer('fudic_test', { paths: ['src'], names: ['x'], failing: true })).toEqual(['FUD1207']);
      expect(await answer('fudic_spec_run', {})).toEqual(['FUD1207']);
      expect(await answer('fudic_spec_run', { spec: 'app-nope', criteria: ['a'] })).toEqual(['FUD1405']);
      await client.close();
    } finally {
      dir.dispose();
    }
  }, 60_000);
});

describe('in a workspace: project by project (SDD-77 §8.2.50)', () => {
  it('targetsOf: every project; or those holding what was asked, with it; or whole, when what was asked holds them', () => {
    const folders = ['/w/apps/web', '/w/libs/ui'];
    expect(targetsOf(folders, [])).toEqual([{ folder: '/w/apps/web' }, { folder: '/w/libs/ui' }]);
    expect(targetsOf(folders, ['/w/libs/ui/src/a.test.ts'])).toEqual([{ folder: '/w/libs/ui', paths: ['/w/libs/ui/src/a.test.ts'] }]);
    expect(targetsOf(folders, ['/w/apps'])).toEqual([{ folder: '/w/apps/web' }]);
    expect(targetsOf(folders, ['/w/docs'])).toEqual([]);
  });

  it('mergedTests: counted together, listed in the order of the projects', () => {
    const report = (n: number, file: string) => ({
      summary: { pass: n, fail: 1, broken: 0, skipped: n },
      tests: [{ verdict: 'fail', file, name: file, at: { file, line: 1, column: 1 }, quote: '', message: '' }],
      files: [{ file, pass: n, fail: 1, broken: 0, skipped: 0 }],
      ms: n,
    }) as never;
    const merged = mergedTests([report(1, 'a'), report(2, 'b')]);
    expect(merged.summary).toEqual({ pass: 3, fail: 2, broken: 0, skipped: 3 });
    expect(merged.tests.map((t) => t.file)).toEqual(['a', 'b']);
    expect(merged.files.map((f) => f.file)).toEqual(['a', 'b']);
    expect(merged.ms).toBe(3);
  });
});
