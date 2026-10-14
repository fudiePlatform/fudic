import { FUD0972 } from '@fudic/diagnostics';
import { describe, expect, it } from 'vitest';
import type { ResultMessage, SessionMessage, StepResult } from '../src/protocol.js';
import { HumanReport } from '../src/report.js';

const SESSION: SessionMessage = {
  v: 2,
  type: 'session',
  tag: 'app-card',
  spec: 'C:/p/app-card.fudspec',
  diagnostics: [],
  criteria: [
    { id: 'altura-minima', route: '/app-card/altura-minima', line: 3, steps: [{ block: 'then', text: 'app-card is at least 44 px tall', file: null }] },
    {
      id: 'titulo-largo-visible',
      route: '/app-card/titulo-largo-visible',
      line: 8,
      steps: [{ block: 'then', text: 'app-card says "A title"', file: null }],
    },
    { id: 'destacada', route: '/app-card/destacada', line: 13, steps: [{ block: 'when', text: 'click role:link/"Featured"', file: null }] },
  ],
};

function result(id: string, verdict: ResultMessage['verdict'], steps: StepResult[], extra: Partial<ResultMessage> = {}): ResultMessage {
  return { v: 2, type: 'result', tag: 'app-card', id, verdict, ms: 252, steps, shots: {}, marks: [], pageErrors: [], ...extra };
}

const step = { block: 'then', term: 'text', layer: 'workspace', args: [] } as const;

function report() {
  const lines: string[] = [];
  return { lines, human: new HumanReport((line) => lines.push(line)) };
}

describe('HumanReport — criterion 12', () => {
  it('prints a block per component, in .fudspec order, with expected against actual under a failure', () => {
    const { lines, human } = report();
    human.message(SESSION);
    human.message({ v: 2, type: 'running', tag: 'app-card', ids: [], trigger: { file: null, at: 0 } });
    // Results arrive as they finish, not in order.
    human.message(
      result('destacada', 'error', [{ block: 'when', term: 'click', layer: 'workspace', args: [], error: 'role:link/"Featured" matches 2 elements' }]),
    );
    human.message(result('titulo-largo-visible', 'fail', [{ ...step, pass: false, evidence: { expected: 'A title', actual: 'A tilte long' } }], { ms: 268 }));
    human.message(result('altura-minima', 'pass', [{ ...step, pass: true, evidence: 'ok' }]));
    human.done('app-card');
    expect(lines).toEqual([
      'app-card',
      '  ✓ altura-minima         252 ms',
      '  ✗ titulo-largo-visible  268 ms',
      '      then app-card says "A title"',
      '        expected  A title',
      '        actual    A tilte long',
      '  ! destacada             252 ms',
      '      when click role:link/"Featured"',
      '        error: role:link/"Featured" matches 2 elements',
    ]);
  });

  it('prints a criterion that could not run with its error, and page errors under it', () => {
    const { lines, human } = report();
    human.message(SESSION);
    human.message(result('altura-minima', 'error', [], { error: 'the page /app-card/altura-minima answered 500', pageErrors: ['boom'] }));
    human.done('app-card');
    expect(lines).toEqual([
      'app-card',
      '  ! altura-minima         error: the page /app-card/altura-minima answered 500',
      '      page error: boom',
    ]);
  });

  it('prints any other evidence as got, cut at 160 characters, and a failed step past the described ones by its term', () => {
    const { lines, human } = report();
    human.message({ ...SESSION, criteria: [{ ...SESSION.criteria[0]!, steps: [] }] });
    human.message(
      result('altura-minima', 'fail', [
        { ...step, pass: false, evidence: 'x'.repeat(200) },
      ]),
    );
    human.message(result('altura-minima', 'fail', [{ ...step, pass: false, evidence: { px: 20 } }]));
    human.done('app-card');
    expect(lines.slice(1)).toEqual([
      '  ✗ altura-minima  252 ms',
      '      then text',
      '        got  {"px":20}',
    ]);
    const long = report();
    long.human.message(SESSION);
    long.human.message(result('altura-minima', 'fail', [{ ...step, pass: false, evidence: 'x'.repeat(200) }]));
    long.human.message(result('titulo-largo-visible', 'fail', [{ ...step, pass: false, evidence: undefined }]));
    long.human.done('app-card');
    expect(long.lines[3]).toBe(`        got  ${'x'.repeat(160)}…`);
    expect(long.lines[6]).toBe('        got  undefined');
  });

  it('a then that passed and a when that did not are not failures', () => {
    const { lines, human } = report();
    human.message(SESSION);
    human.message(
      result('altura-minima', 'pass', [
        { block: 'when', term: 'click', layer: 'workspace', args: [], pass: false, evidence: 'missed' },
        { ...step, pass: true, evidence: 'ok' },
      ]),
    );
    human.done('app-card');
    expect(lines).toEqual(['app-card', '  ✓ altura-minima         252 ms']);
  });

  it('prints the diagnostics of a session under its tag, with their place when they have one', () => {
    const { lines, human } = report();
    human.message({
      ...SESSION,
      criteria: [],
      diagnostics: [
        { code: 'FUD0933', severity: 'error', message: 'no then', file: 'C:/p/app-card.fudspec', line: 3, column: 11 },
        { code: 'FUD0974', severity: 'error', message: 'not JSON', file: 'C:/p/app-card.fixture.ts', line: null, column: null },
        { code: 'FUD0972', severity: 'warning', message: 'no spec', file: null, line: null, column: null },
      ],
    });
    human.done('app-card');
    expect(lines).toEqual([
      'app-card',
      '  error FUD0933 no then — C:/p/app-card.fudspec:3:11',
      '  error FUD0974 not JSON — C:/p/app-card.fixture.ts',
      '  warning FUD0972 no spec',
    ]);
  });

  it('prints nothing for a component it never saw, nor for a criterion with no result', () => {
    const { lines, human } = report();
    human.done('app-card');
    human.message(SESSION);
    human.done('app-card');
    expect(lines).toEqual(['app-card']);
  });

  it('prints a diagnostic on its own line, and the count with the time and the browser', () => {
    const { lines, human } = report();
    human.diagnostic(FUD0972({ file: 'C:/p/app-x.fud' }));
    human.summary({ pass: 1, fail: 1, error: 1, ms: 1234, browser: 'chrome', results: [] });
    human.summary({ pass: 0, fail: 0, error: 1, ms: 50, browser: null, results: [] });
    expect(lines[0]).toMatch(/^warning FUD0972 /u);
    expect(lines.slice(1)).toEqual([
      '3 criteria · 1 pass · 1 fail · 1 error · 1.2 s · chrome',
      '1 criteria · 0 pass · 0 fail · 1 error · 0.1 s',
    ]);
  });
});
