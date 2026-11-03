/**
 * SDD-64 §4.1–4.3, without a browser: `reportOf` builds a criterion's report from the session and
 * the result alone. Where the criterion and its steps are, the first red `then`, the evidence of a
 * project term normalized to text (criterion 7), and why a criterion could not run (criterion 8).
 */

import { FUD1201, FUD1205, FUD1207 } from '@fudic/diagnostics';
import { describe, expect, it } from 'vitest';
import type { CriterionResult } from '../src/engine.js';
import type { PlannedCriterion } from '../src/pages.js';
import { problemOf, toWire } from '../src/protocol.js';
import { evidenceOf, reportOf, type ReportSession } from '../src/report-of.js';

const ROOT = 'C:/p';
const SPEC = 'C:/p/src/components/acme-button.fudspec';

/** Line 3 is the criterion; line 5 the `when`, line 7 the first `then`, line 8 the second. */
const TEXT = [
  'component acme-button',
  '',
  'criterion disabled-no-press',
  '  when',
  '    click acme-button   ',
  '  then',
  '    emitted press 0',
  '    text acme-button "Save"',
  '',
].join('\r\n');

const offset = (needle: string) => TEXT.indexOf(needle);

const CRITERION: PlannedCriterion = {
  id: 'disabled-no-press',
  route: '/acme-button/disabled-no-press',
  mount: 'body > acme-button',
  offset: offset('criterion'),
  spec: SPEC,
  fixture: null,
  steps: [
    { block: 'when', term: 'click', args: ['acme-button'], offset: offset('click') },
    { block: 'then', term: 'emitted', args: ['press', '0'], offset: offset('emitted') },
    { block: 'then', term: 'text', args: ['acme-button', 'Save'], offset: offset('text acme') },
  ],
};

/** The component and a workspace library's, as the disk would answer them. */
const FILES: Record<string, string> = {
  'C:/p/src/components/acme-button/acme-button.fud':
    '<acme-button>\n  <template shadowrootmode="open">\n    <button disabled>\n      <span>Save</span>\n    </button>\n  </template>\n</acme-button>\n',
  'C:/libs/ui/src/components/ui-card/ui-card.fud': '<ui-card>\n  <template shadowrootmode="open">\n    <article>card</article>\n  </template>\n</ui-card>\n',
};

function session(expectations: readonly (string | null)[] = [null, null, null]): ReportSession {
  return {
    criteria: [CRITERION],
    source: { root: ROOT, spec: SPEC, text: TEXT, expectations: new Map([[CRITERION.id, expectations]]), read: (file) => FILES[file] },
  };
}

function result(extra: Partial<CriterionResult>): CriterionResult {
  return { id: CRITERION.id, verdict: 'pass', ms: 12, steps: [], pageErrors: [], shots: {}, marks: [], diagnostics: [], ...extra };
}

const CLICKED = { block: 'when', term: 'click', layer: 'framework', args: ['acme-button'], pass: true, evidence: 'clicked acme-button' } as const;
const at = (line: number, column: number) => ({ file: 'src/components/acme-button.fudspec', line, column });

describe('reportOf — the place of the criterion, and green (criteria 1 and 3)', () => {
  it('a green criterion has its place, and nothing a red one needs, even with shots given', () => {
    const report = reportOf(session(), result({ steps: [CLICKED] }), { after: '.fudic/runs/x.png' });
    expect(report).toEqual({ spec: 'src/components/acme-button.fudspec', id: 'disabled-no-press', at: at(3, 1), verdict: 'pass', ms: 12, pageErrors: [] });
  });

  it('a result of a criterion the session does not plan sits at the top of the file', () => {
    expect(reportOf(session(), result({ id: 'gone' })).at).toEqual(at(1, 1));
  });
});

describe('reportOf — the first red then (criteria 1, 2 and 7)', () => {
  const red = (evidence: unknown, extra: object = {}) => ({ block: 'then', term: 'emitted', layer: 'workspace', args: ['press', '0'], pass: false, evidence, ...extra }) as const;

  it('names only the first then in red, with its line and the step as written, trimmed', () => {
    const second = { block: 'then', term: 'text', layer: 'framework', args: [], pass: false, evidence: { expected: 'contains "Save"', actual: '"Cancel"' } } as const;
    const report = reportOf(session(), result({ verdict: 'fail', steps: [CLICKED, red({ expected: '0', actual: '1' }), second] }), {
      after: '.fudic/runs/acme-button/disabled-no-press.after.png',
    });
    expect(report.failed).toEqual({ step: 'then  emitted press 0', at: at(7, 5), expected: '0', actual: '1' });
    expect(report.shots).toEqual({ after: '.fudic/runs/acme-button/disabled-no-press.after.png' });
    expect(report).not.toHaveProperty('broken');
  });

  it('a red without shots says none', () => {
    expect(reportOf(session(), result({ verdict: 'fail', steps: [CLICKED, red('1')] }))).not.toHaveProperty('shots');
  });

  it('criterion 7: a project term that answers "1" and has describe: expected is its describe, actual "1"', () => {
    const report = reportOf(session([null, 'acme-button emitted press 0 times', null]), result({ verdict: 'fail', steps: [CLICKED, red('1')] }));
    expect(report.failed).toMatchObject({ expected: 'acme-button emitted press 0 times', actual: '1' });
  });

  it('criterion 7: one that answers null and has no describe: expected is the step as written, actual "—"', () => {
    const report = reportOf(session(), result({ verdict: 'fail', steps: [CLICKED, red(null)] }));
    expect(report.failed).toMatchObject({ expected: 'then  emitted press 0', actual: '—' });
  });

  it('criterion 7: without expectations for the criterion, the step as written too', () => {
    const bare: ReportSession = { ...session(), source: { ...session().source, expectations: new Map() } };
    expect(reportOf(bare, result({ verdict: 'fail', steps: [CLICKED, red('x')] })).failed).toMatchObject({ expected: 'then  emitted press 0' });
  });

  it('a fail without any red then, or without its planned step, names none', () => {
    expect(reportOf(session(), result({ verdict: 'fail', steps: [CLICKED] }))).not.toHaveProperty('failed');
    const unplanned = { ...session(), criteria: [{ ...CRITERION, steps: [] }] };
    expect(reportOf(unplanned, result({ verdict: 'fail', steps: [red('1')] }))).not.toHaveProperty('failed');
    expect(reportOf(session(), result({ id: 'gone', verdict: 'fail', steps: [red('1')] }))).not.toHaveProperty('failed');
  });
});

describe('reportOf — the element back in its .fud (criteria 1 and 14, §4.1)', () => {
  const red = { block: 'then', term: 'emitted', layer: 'workspace', args: [], pass: false, evidence: '1' } as const;
  const THREW = { block: 'when', term: 'click', layer: 'workspace', args: [], error: 'x', code: 'FUD1204' } as const;
  const box = { x: 0, y: 0, width: 80, height: 32 };
  const mark = (step: number, source?: string) => ({ step, ref: 'acme-button', box, ...(source !== undefined ? { source } : {}) });
  const BUTTON = 'src/components/acme-button/acme-button.fud';

  it('a red then: the last mark of that step with a source, its line quoted and trimmed', () => {
    const marks = [mark(0, `${BUTTON}:1:1`), mark(1, `${BUTTON}:1:1`), mark(1), mark(1, `${BUTTON}:3:5`), mark(2, `${BUTTON}:4:7`)];
    const report = reportOf(session(), result({ verdict: 'fail', steps: [CLICKED, red], marks }));
    expect(report.source).toEqual({ at: { file: BUTTON, line: 3, column: 5 }, quote: '<button disabled>' });
  });

  it('a step that threw: the mark of that step', () => {
    const report = reportOf(session(), result({ verdict: 'error', steps: [THREW], marks: [mark(0, `${BUTTON}:4:7`)] }));
    expect(report.source).toEqual({ at: { file: BUTTON, line: 4, column: 7 }, quote: '<span>Save</span>' });
  });

  it('a component of a workspace library: its path relative to the project, read from there', () => {
    const LIB = '../libs/ui/src/components/ui-card/ui-card.fud';
    const report = reportOf(session(), result({ verdict: 'fail', steps: [CLICKED, red], marks: [mark(1, `${LIB}:3:5`)] }));
    expect(report.source).toEqual({ at: { file: LIB, line: 3, column: 5 }, quote: '<article>card</article>' });
  });

  it.each([
    ['no mark on the failed step', [mark(0, `${BUTTON}:3:5`)]],
    ['marks without a source: an element no .fud wrote, like the body', [mark(1)]],
    ['a source that is not file:line:column', [mark(1, 'nowhere')]],
    ['a file that cannot be read', [mark(1, 'src/gone.fud:1:1')]],
    ['a line past the end of the file', [mark(1, `${BUTTON}:99:1`)]],
  ])('no source: %s', (_what, marks) => {
    expect(reportOf(session(), result({ verdict: 'fail', steps: [CLICKED, red], marks }))).not.toHaveProperty('source');
  });

  it('no source on a green, nor on an error where no step threw', () => {
    const marks = [mark(0, `${BUTTON}:3:5`)];
    expect(reportOf(session(), result({ steps: [CLICKED], marks }))).not.toHaveProperty('source');
    expect(reportOf(session(), result({ verdict: 'error', steps: [CLICKED], marks }))).not.toHaveProperty('source');
  });
});

describe('evidenceOf — the evidence of a term, as text (§4.2)', () => {
  it.each([
    ['Evidence as it is', { expected: 'at least 44px', actual: '32px' }, { expected: 'at least 44px', actual: '32px' }],
    ['Evidence of other values, written as JSON', { expected: 0, actual: [1] }, { expected: '0', actual: '[1]' }],
    ['a sentence', 'clicked', { expected: 'step', actual: 'clicked' }],
    ['null', null, { expected: 'step', actual: '—' }],
    ['undefined', undefined, { expected: 'step', actual: '—' }],
    ['another object', { count: 2 }, { expected: 'step', actual: '{"count":2}' }],
    ['a number', 1, { expected: 'step', actual: '1' }],
    ['something JSON cannot write', () => 1, { expected: 'step', actual: '() => 1' }],
  ])('%s', (_what, value, expected) => {
    expect(evidenceOf(value, 'step')).toEqual(expected);
  });
});

describe('reportOf — why it could not run (criterion 8)', () => {
  const THREW = { block: 'when', term: 'click', layer: 'workspace', args: ['acme-button'], error: 'there is no when term "click"', code: 'FUD1201' } as const;

  it('a step that threw: the step as written, its line, and its diagnostic located in the .fudspec', () => {
    const problem = FUD1201({ file: SPEC, span: { start: offset('click'), end: offset('click') }, term: 'click' });
    const report = reportOf(session(), result({ verdict: 'error', steps: [THREW], diagnostics: [problem] }));
    expect(report.broken).toEqual({
      step: 'when  click acme-button',
      at: at(5, 5),
      diagnostics: [{ code: 'FUD1201', severity: 'error', message: problem.message, file: 'src/components/acme-button.fudspec', line: 5, column: 5 }],
    });
    expect(report).not.toHaveProperty('failed');
  });

  it('nothing ran: at the criterion, with a diagnostic of no file, and one of another file without its line', () => {
    const other = { ...FUD1207({ reason: 'x' }), file: 'C:/p/fudic/bench.js', span: { start: 0, end: 1 } };
    const report = reportOf(session(), result({ verdict: 'error', diagnostics: [FUD1205({ error: 'boom' }), other] }));
    expect(report.broken).toEqual({
      at: at(3, 1),
      diagnostics: [
        { code: 'FUD1205', severity: 'error', message: 'the page threw: boom', file: null, line: null, column: null },
        { code: 'FUD1207', severity: 'error', message: 'could not run: x', file: 'fudic/bench.js', line: null, column: null },
      ],
    });
  });

  it('an error of a criterion the session does not plan sits at the top of the file', () => {
    expect(reportOf(session(), result({ id: 'gone', verdict: 'error', steps: [THREW] })).broken).toEqual({ at: at(1, 1), diagnostics: [] });
  });
});

describe('problemOf — what stops the bench, with codes (§4.3)', () => {
  it('a .fud that does not compile gives every one of its diagnostics, as they are', () => {
    const diagnostics = [
      { code: 'FUD0540', severity: 'error', message: 'a', file: 'src/a.fud', line: 2, column: 3 },
      { code: 'FUD0541', severity: 'error', message: 'b', file: 'src/a.fud', line: 9, column: 1 },
    ] as const;
    const error = Object.assign(new Error('src/a.fud: a\nmore'), { fudic: { diagnostics } });
    expect(problemOf(error)).toEqual({ v: 2, type: 'problem', message: 'src/a.fud: a', diagnostics });
  });

  it('anything else is one FUD1207 with the first line, an Error or not', () => {
    expect(problemOf(new Error('Chrome went away\nstack'))).toEqual({
      v: 2,
      type: 'problem',
      message: 'Chrome went away',
      diagnostics: [{ code: 'FUD1207', severity: 'error', message: 'could not run: Chrome went away', file: null, line: null, column: null }],
    });
    expect(problemOf('plain').diagnostics[0]).toMatchObject({ code: 'FUD1207', message: 'could not run: plain' });
  });
});

describe('toWire — a diagnostic for the wire', () => {
  const step = FUD1201({ file: SPEC, span: { start: offset('click'), end: offset('click') }, term: 'click' });

  it('with the text of its file, its line and column', () => {
    expect(toWire(step, null, () => TEXT)).toMatchObject({ file: SPEC, line: 5, column: 5 });
  });

  it('without a way to read its file, the file alone', () => {
    expect(toWire(step, null)).toMatchObject({ file: SPEC, line: null, column: null });
  });
});
