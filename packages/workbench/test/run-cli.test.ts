import { FUD0975, FUD0976 } from '@fudic/diagnostics';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BenchMessage } from '../src/protocol.js';
import type { RunOptions, RunSummary } from '../src/run.js';

const runSpecs = vi.hoisted(() => vi.fn());
vi.mock('../src/run.js', () => ({ runSpecs }));

const { parseRecordArgs, parseRunArgs, recordMain, runMain, RECORD_USAGE, RUN_USAGE } = await import('../src/run-cli.js');

afterEach(() => {
  runSpecs.mockReset();
});

function io() {
  const lines: string[] = [];
  const exits: number[] = [];
  return { lines, exits, io: { cwd: 'C:/p', write: (line: string) => void lines.push(line), exit: (code: number) => void exits.push(code) } };
}

const SESSION: BenchMessage = {
  v: 2,
  type: 'session',
  tag: 'app-card',
  spec: 'C:/p/app-card.fudspec',
  diagnostics: [],
  criteria: [{ id: 'a', route: '/app-card/a', line: 3, props: null, steps: [] }],
};
const RESULT: BenchMessage = { v: 2, type: 'result', tag: 'app-card', id: 'a', verdict: 'pass', ms: 5, steps: [], shots: {}, marks: [], pageErrors: [] };

/** A run that publishes a session and a result, says the component is done, and sums up. */
function plays(summary: Partial<RunSummary>) {
  runSpecs.mockImplementation(async (_paths: readonly string[], options: RunOptions) => {
    options.onDiagnostic?.(FUD0976({ where: 'C:/p/x' }));
    options.onMessage?.(SESSION);
    options.onMessage?.(RESULT);
    options.onDone?.('app-card');
    return { pass: 1, fail: 0, error: 0, ms: 1500, browser: 'msedge', results: [], ...summary };
  });
}

describe('parseRunArgs — criterion 12', () => {
  it('reads paths, a browser, the workers and --json, in any order', () => {
    expect(parseRunArgs([])).toEqual({ paths: [], json: false, passWithNoSpecs: false, failing: false });
    expect(parseRunArgs(['src', '--json', '--browser', 'firefox', 'lib', '--workers', '2', '--pass-with-no-specs', '--failing'])).toEqual({
      paths: ['src', 'lib'],
      json: true,
      passWithNoSpecs: true,
      failing: true,
      browser: 'firefox',
      workers: 2,
    });
  });

  it.each([[['--verbose']], [['--browser', 'opera']], [['--browser']], [['--workers', '0']], [['--workers']]])('refuses %j', (argv) => {
    expect(parseRunArgs(argv)).toBeUndefined();
  });
});

describe('runMain — criterion 12', () => {
  it('prints the usage and exits 1 for bad arguments', async () => {
    const t = io();
    await runMain(['--nope'], t.io);
    expect([t.lines, t.exits]).toEqual([[RUN_USAGE], [1]]);
    expect(runSpecs).not.toHaveBeenCalled();
  });

  it('prints blocks and the count for a person, from the folder it started in, and exits 0 when all pass', async () => {
    plays({});
    const t = io();
    await runMain(['--browser', 'msedge', '--workers', '3'], t.io);
    expect(runSpecs).toHaveBeenCalledWith([], expect.objectContaining({ root: 'C:/p', browser: 'msedge', workers: 3 }));
    expect(t.lines[0]).toMatch(/^error FUD0976 /u);
    expect(t.lines.slice(1)).toEqual(['app-card', '  ✓ a  5 ms', '1 criteria · 1 pass · 0 fail · 0 error · 1.5 s · msedge']);
    expect(t.exits).toEqual([0]);
  });

  it('with --json, prints every message as a v: 2 line, diagnostics as lines, and the summary last', async () => {
    plays({ fail: 1 });
    const t = io();
    await runMain(['--json'], t.io);
    const lines = t.lines.map((l) => JSON.parse(l) as { v: number; type: string });
    expect(lines.every((l) => l.v === 2)).toBe(true);
    expect(lines.map((l) => l.type)).toEqual(['diagnostic', 'session', 'result', 'summary']);
    expect(lines[0]).toMatchObject({ code: 'FUD0976', severity: 'error' });
    expect(lines.at(-1)).toEqual({ v: 2, type: 'summary', pass: 1, fail: 1, error: 0, ms: 1500, browser: 'msedge' });
    expect(t.exits).toEqual([1]);
  });

  it('exits 1 when any criterion is in error', async () => {
    plays({ error: 1 });
    const t = io();
    await runMain([], t.io);
    expect(t.exits).toEqual([1]);
  });

  it('with nothing to run, prints FUD0976 and exits 1, for a person and in JSON', async () => {
    runSpecs.mockResolvedValue({ diagnostic: FUD0976({ where: 'C:/p' }) });
    const t = io();
    await runMain([], t.io);
    expect(t.lines).toHaveLength(1);
    expect(t.lines[0]).toMatch(/^error FUD0976 /u);
    expect(t.exits).toEqual([1]);
    const j = io();
    await runMain(['--json'], j.io);
    expect(JSON.parse(j.lines[0]!)).toMatchObject({ v: 2, type: 'diagnostic', code: 'FUD0976', severity: 'error' });
    expect(j.exits).toEqual([1]);
  });

  it('prints the first line of what the run threw, and exits 1', async () => {
    runSpecs.mockRejectedValue(new Error('listen EADDRINUSE\n    at stack'));
    const t = io();
    await runMain([], t.io);
    expect([t.lines, t.exits]).toEqual([['error listen EADDRINUSE'], [1]]);
  });
});

describe('runMain --pass-with-no-specs — BUG-50 §4.2', () => {
  it('says it in RUN_USAGE', () => {
    expect(RUN_USAGE).toContain('[--pass-with-no-specs]');
  });

  it('with nothing to run, says so and exits 0, for a person and in JSON', async () => {
    runSpecs.mockResolvedValue({ diagnostic: FUD0976({ where: 'C:/p' }) });
    const t = io();
    await runMain(['--pass-with-no-specs'], t.io);
    expect([t.lines, t.exits]).toEqual([['no .fudspec yet: nothing to run'], [0]]);

    const j = io();
    await runMain(['--json', '--pass-with-no-specs'], j.io);
    expect(j.lines.map((l) => JSON.parse(l) as unknown)).toEqual([
      { v: 2, type: 'summary', pass: 0, fail: 0, error: 0, ms: 0, browser: null },
    ]);
    expect(j.exits).toEqual([0]);
  });

  it('lets every other failure fail: a browser that does not launch is still exit 1', async () => {
    runSpecs.mockResolvedValue({ diagnostic: FUD0975({ tried: ['chrome'], reason: 'none', install: 'npx playwright-core install chromium' }) });
    const t = io();
    await runMain(['--pass-with-no-specs'], t.io);
    expect(t.lines[0]).toMatch(/^error FUD0975 /u);
    expect(t.exits).toEqual([1]);
  });

  it('does not touch a run that found criteria', async () => {
    plays({ fail: 1 });
    const t = io();
    await runMain(['--pass-with-no-specs'], t.io);
    expect(t.lines.at(-1)).toBe('2 criteria · 1 pass · 1 fail · 0 error · 1.5 s · msedge');
    expect(t.exits).toEqual([1]);
  });
});

describe('record — SDD-82 §3.9', () => {
  it('parseRecordArgs reads paths, criteria, a browser and --json; refuses the rest', () => {
    expect(parseRecordArgs([])).toEqual({ paths: [], criteria: [], json: false });
    expect(parseRecordArgs(['a.fudspec', '--criterion', 'x', '--json', '--criterion', 'y', '--browser', 'firefox'])).toEqual({
      paths: ['a.fudspec'],
      criteria: ['x', 'y'],
      json: true,
      browser: 'firefox',
    });
    for (const argv of [['--criterion'], ['--criterion', '--json'], ['--browser', 'opera'], ['--workers', '2']]) expect(parseRecordArgs(argv)).toBeUndefined();
  });

  it('a wrong argument prints the usage and exits 1', async () => {
    const t = io();
    await recordMain(['--nope'], t.io);
    expect(t.lines).toEqual([RECORD_USAGE]);
    expect(t.exits).toEqual([1]);
  });

  const RECORDING = {
    recorded: [{ spec: 'C:/p/src/routes/usuarios.fudspec', id: 'a', data: ['a', 'a-2'], calls: ['login'] }],
    skipped: [{ spec: 'C:/p/src/routes/usuarios.fudspec', id: 'b', reason: 'it did not pass (fail)' }],
    diagnostics: [],
  };

  it('runs with record, only the criteria named, and says what it wrote for a person', async () => {
    runSpecs.mockImplementation(async (_paths: readonly string[], options: RunOptions) => {
      options.onDiagnostic?.(FUD0975({ tried: [], reason: 'x', install: 'y' }));
      return { pass: 1, fail: 1, error: 0, ms: 1, browser: 'msedge', results: [], reports: [], recording: RECORDING };
    });
    const t = io();
    await recordMain(['src/routes/usuarios.fudspec', '--criterion', 'a', '--browser', 'chromium'], t.io);
    expect(runSpecs).toHaveBeenCalledWith(['src/routes/usuarios.fudspec'], expect.objectContaining({ root: 'C:/p', record: true, criteria: ['a'], browser: 'chromium' }));
    expect(t.lines.slice(-3)).toEqual([
      'recorded src/routes/usuarios.fudspec a: data [a, a-2] · calls [login]',
      'not recorded src/routes/usuarios.fudspec b: it did not pass (fail)',
      '1 recorded, 1 not recorded',
    ]);
    expect(t.exits).toEqual([1]);
  });

  it('in JSON, one line each; everything recorded exits 0', async () => {
    runSpecs.mockImplementation(async (_paths: readonly string[], options: RunOptions) => {
      options.onDiagnostic?.(FUD0975({ tried: [], reason: 'x', install: 'y' }));
      return { pass: 1, fail: 0, error: 0, ms: 1, browser: 'msedge', results: [], reports: [], recording: { ...RECORDING, skipped: [] } };
    });
    const t = io();
    await recordMain(['--json'], t.io);
    expect(t.lines.map((l) => JSON.parse(l) as { type: string })).toEqual([
      expect.objectContaining({ type: 'diagnostic', code: 'FUD0975' }),
      { v: 2, type: 'recorded', spec: 'src/routes/usuarios.fudspec', id: 'a', data: ['a', 'a-2'], calls: ['login'] },
      { v: 2, type: 'summary', recorded: 1, skipped: 0, error: 0 },
    ]);
    expect(t.exits).toEqual([0]);
  });

  it('a skipped one in JSON; nothing recorded exits 1', async () => {
    runSpecs.mockResolvedValue({ pass: 0, fail: 1, error: 0, ms: 1, browser: 'msedge', results: [], reports: [], recording: { ...RECORDING, recorded: [] } });
    const t = io();
    await recordMain(['--json'], t.io);
    expect(JSON.parse(t.lines[0]!)).toEqual({ v: 2, type: 'skipped', spec: 'src/routes/usuarios.fudspec', id: 'b', reason: 'it did not pass (fail)' });
    expect(t.exits).toEqual([1]);
  });

  it('a run that cannot start says why, in either form, and exits 1', async () => {
    runSpecs.mockResolvedValue({ diagnostic: FUD0976({ where: 'C:/p' }) });
    const human = io();
    await recordMain([], human.io);
    expect(human.lines.join('\n')).toContain('FUD0976');
    const json = io();
    await recordMain(['--json'], json.io);
    expect(JSON.parse(json.lines[0]!)).toMatchObject({ type: 'diagnostic', code: 'FUD0976' });
    expect([human.exits, json.exits]).toEqual([[1], [1]]);
  });

  it('a run that throws is one line and exit 1', async () => {
    runSpecs.mockRejectedValue(new Error('boom'));
    const t = io();
    await recordMain([], t.io);
    expect(t.lines).toEqual(['error boom']);
    expect(t.exits).toEqual([1]);
  });
});
