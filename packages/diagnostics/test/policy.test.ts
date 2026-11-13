/**
 * SDD-83 §3.1, §4.1: what a file's diagnostics become under the policy and its comments.
 * Criteria 1–4 and 7–8, 10–12 on the functions, without a build.
 */

import { describe, expect, it } from 'vitest';
import {
  applyPolicy,
  FUD0051,
  FUD0480,
  FUD1022,
  FUD1380,
  govern,
  LineMap,
  reportedLevel,
  type FileDiagnostic,
  type FudCode,
  type Policy,
  type PolicyLevel,
  type SourceComment,
  type Suppression,
} from '../src/index.js';

const SOURCE = 'line0\nline1\nline2\nline3';
const LINES = new LineMap(SOURCE);
/** A span starting on 0-based `line`. */
const on = (line: number) => ({ start: line * 6, end: line * 6 + 4 });

const loop = (line: number) => FUD1380({ span: on(line), event: 'click' });
const missing = (line: number) => FUD1022({ span: on(line), locale: 'es' });
const broken = (line: number) => FUD0051({ span: on(line), name: 'p' });
const info = (line: number) => FUD0480({ span: on(line) });

const policy = (codes: Record<string, PolicyLevel>, warnings?: PolicyLevel): Policy => ({
  codes: new Map(Object.entries(codes) as [FudCode, PolicyLevel][]),
  ...(warnings === undefined ? {} : { warnings }),
});

describe('the policy', () => {
  it('no policy, no comments: every diagnostic as it is', () => {
    const all = [loop(0), broken(1)];
    expect(applyPolicy(all, null, [], LINES)).toEqual({ diagnostics: all, unused: [] });
  });

  it('"FUD1380": "off" removes it (criterion 1)', () => {
    expect(applyPolicy([loop(0), missing(1)], policy({ FUD1380: 'off' }), [], LINES).diagnostics).toEqual([missing(1)]);
  });

  it('"FUD1022": "error" raises it, and the message says so (criterion 2)', () => {
    const [d] = applyPolicy([missing(0)], policy({ FUD1022: 'error' }), [], LINES).diagnostics;
    expect(d?.severity).toBe('error');
    expect(d?.message).toBe(`${missing(0).message} (warning by default; error in this project)`);
  });

  it('"warnings": "error" raises every warning; a code of its own wins (criterion 3)', () => {
    const result = applyPolicy([loop(0), missing(1), info(2)], policy({ FUD1380: 'off' }, 'error'), [], LINES);
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([
      ['FUD1022', 'error'],
      // An info is not a warning: `warnings` leaves it alone.
      ['FUD0480', 'info'],
    ]);
  });

  it('a warning lowered to a hint, and an entry at its own severity changes nothing', () => {
    const [hint] = applyPolicy([loop(0)], policy({ FUD1380: 'hint' }), [], LINES).diagnostics;
    expect(hint).toMatchObject({ severity: 'hint', message: expect.stringContaining('(warning by default; hint in this project)') });
    expect(applyPolicy([loop(0)], policy({ FUD1380: 'warning' }), [], LINES).diagnostics).toEqual([loop(0)]);
  });

  it('an error is never lowered, whatever the policy holds (criterion 4)', () => {
    // The reader refuses such an entry (FUD1521); a policy built by hand still cannot lower it.
    expect(applyPolicy([broken(0)], policy({ FUD0051: 'off' }, 'off'), [], LINES).diagnostics).toEqual([broken(0)]);
  });
});

describe('the comments', () => {
  const nextLine = (line: number, ...codes: FudCode[]): Suppression => ({ codes, scope: 'next-line', span: on(line - 1), line });
  const file = (...codes: FudCode[]): Suppression => ({ codes, scope: 'file', span: on(3) });

  it('next-line silences that line and no other (criterion 7)', () => {
    const result = applyPolicy([loop(1), loop(2)], null, [nextLine(1, 'FUD1380')], LINES);
    expect(result).toEqual({ diagnostics: [loop(2)], unused: [] });
  });

  it('file silences the whole file (criterion 8)', () => {
    expect(applyPolicy([loop(0), loop(2)], null, [file('FUD1380')], LINES).diagnostics).toEqual([]);
  });

  it('a comment wins over the policy, so a code raised by it is still silenced', () => {
    expect(applyPolicy([loop(1)], policy({}, 'error'), [nextLine(1, 'FUD1380')], LINES).diagnostics).toEqual([]);
  });

  it('an error is not silenced by a comment', () => {
    expect(applyPolicy([broken(1)], null, [nextLine(1, 'FUD0051')], LINES).diagnostics).toEqual([broken(1)]);
  });

  it('what silenced nothing comes back, with only the codes that did not occur (criterion 12)', () => {
    const result = applyPolicy([loop(1)], null, [nextLine(1, 'FUD1380', 'FUD1022'), file('FUD0480')], LINES);
    expect(result.unused).toEqual([nextLine(1, 'FUD1022'), file('FUD0480')]);
  });

  it('a diagnostic with no span is silenced only by the file scope', () => {
    const noSpan: FileDiagnostic = { severity: 'warning', code: 'FUD1380', message: 'm', file: 'self.fud' };
    expect(applyPolicy([noSpan], null, [nextLine(0, 'FUD1380')], LINES, 'self.fud').diagnostics).toEqual([noSpan]);
    expect(applyPolicy([noSpan], null, [file('FUD1380')], LINES, 'self.fud').diagnostics).toEqual([]);
  });

  it("a diagnostic of another file obeys the policy, not this file's comments", () => {
    const elsewhere = { ...loop(1), file: '/p/other.fud' };
    expect(applyPolicy([elsewhere], null, [file('FUD1380')], LINES).diagnostics).toEqual([elsewhere]);
    expect(applyPolicy([elsewhere], policy({ FUD1380: 'off' }), [], LINES).diagnostics).toEqual([]);
    // Named by its own path, in either spelling of the slashes, it is this file's.
    expect(applyPolicy([{ ...loop(1), file: 'C:\\p\\a.fud' }], null, [file('FUD1380')], LINES, 'C:/p/a.fud').diagnostics).toEqual([]);
  });
});

describe('govern: the four steps of §4.1', () => {
  const comment = (text: string, start: number): SourceComment => ({ span: { start, end: start + text.length }, text });

  it('reads the comments, applies the policy and reports what silenced nothing when complete', () => {
    const source = '@* fud-disable-next-line FUD1380: r *@\nx\n@* fud-disable FUD1022: r *@';
    const lines = new LineMap(source);
    const comments = [comment('@* fud-disable-next-line FUD1380: r *@', 0), comment('@* fud-disable FUD1022: r *@', 41)];
    const x = FUD1380({ span: { start: 39, end: 40 }, event: 'click' });

    expect(govern([x], null, comments, lines)).toEqual([]);
    expect(govern([x], null, comments, lines, { complete: true })).toEqual([
      expect.objectContaining({ code: 'FUD1523', severity: 'hint', span: { start: 41, end: 69 } }),
    ]);
  });

  it("what a comment says obeys the policy, and so does a FUD1523", () => {
    const source = '// fud-disable FUD9999: r';
    const result = govern([], policy({ FUD1520: 'off', FUD1523: 'error' }), [comment(source, 0)], new LineMap(source), { complete: true });
    expect(result).toEqual([]);

    const unused = '// fud-disable FUD1380: r';
    const raised = govern([], policy({ FUD1523: 'error' }), [comment(unused, 0)], new LineMap(unused), { complete: true });
    expect(raised.map((d) => [d.code, d.severity])).toEqual([['FUD1523', 'error']]);
  });

  it('a comment without a reason silences nothing and says so (criterion 10)', () => {
    const source = '// fud-disable-next-line FUD1380\nx';
    const x = FUD1380({ span: { start: 33, end: 34 }, event: 'click' });
    expect(govern([x], null, [comment('// fud-disable-next-line FUD1380', 0)], new LineMap(source)).map((d) => d.code)).toEqual([
      'FUD1380',
      'FUD1522',
    ]);
  });
});

describe('reportedLevel: how the project reports a code', () => {
  it('the code entry, then `warnings` for a warning, then its own severity; an error stays one', () => {
    const p = policy({ FUD1380: 'off', FUD0051: 'off' }, 'error');
    expect(reportedLevel('FUD1380', 'warning', p)).toBe('off');
    expect(reportedLevel('FUD1022', 'warning', p)).toBe('error');
    expect(reportedLevel('FUD0480', 'info', p)).toBe('info');
    expect(reportedLevel('FUD0051', 'error', p)).toBe('error');
    expect(reportedLevel('FUD1022', 'warning', null)).toBe('warning');
  });
});
