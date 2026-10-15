import { FUD0976 } from '@fudic/diagnostics';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BenchMessage } from '../src/protocol.js';
import type { RunOptions, RunSummary } from '../src/run.js';

const runSpecs = vi.hoisted(() => vi.fn());
vi.mock('../src/run.js', () => ({ runSpecs }));

const { parseRunArgs, runMain, RUN_USAGE } = await import('../src/run-cli.js');

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
    expect(parseRunArgs([])).toEqual({ paths: [], json: false });
    expect(parseRunArgs(['src', '--json', '--browser', 'firefox', 'lib', '--workers', '2'])).toEqual({
      paths: ['src', 'lib'],
      json: true,
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
