/**
 * SDD-83 §3.12: what each code of tailored diagnostics and Baseline says, branch by branch, and
 * the two problems `FUD0725` gains.
 */

import { describe, expect, it } from 'vitest';
import {
  FUD0725,
  FUD1520,
  FUD1521,
  FUD1522,
  FUD1523,
  FUD1524,
  FUD1525,
  FUD1526,
  FUD1527,
  FUD1528,
  span,
} from '../src/index.js';

const S = span(4, 11);
const F = 'fudic.json';

describe('FUD1520: a code that does not exist', () => {
  it('in the policy, on its key', () => {
    expect(FUD1520({ place: 'policy', code: 'FUD9999', file: F, span: S })).toEqual({
      severity: 'warning',
      code: 'FUD1520',
      message: 'FUD9999 is not a fudic code, so its entry in "diagnostics" does nothing',
      file: F,
      span: S,
    });
  });

  it('in a comment, with what replaced a retired code', () => {
    expect(FUD1520({ place: 'comment', code: 'FUD0050', replacedBy: ['FUD0052', 'FUD0051'], span: S })).toEqual({
      severity: 'warning',
      code: 'FUD1520',
      message: 'FUD0050 is retired: it was replaced by FUD0052, FUD0051, so this comment does not silence it',
      span: S,
    });
  });

  it('a retired code nothing replaced reads as one that does not exist', () => {
    expect(FUD1520({ place: 'comment', code: 'FUD0090', replacedBy: [], span: S }).message).toBe(
      'FUD0090 is not a fudic code, so this comment does not silence it',
    );
  });
});

describe('FUD1521: an error cannot be lowered', () => {
  it('in the policy, with the level it asked for', () => {
    expect(FUD1521({ place: 'policy', code: 'FUD0051', level: 'off', file: F })).toEqual({
      severity: 'error',
      code: 'FUD1521',
      message: '"FUD0051": "off" does not apply: FUD0051 is an error, and an error cannot be lowered',
      file: F,
    });
  });

  it('in a comment', () => {
    expect(FUD1521({ place: 'comment', code: 'FUD0051', span: S })).toEqual({
      severity: 'error',
      code: 'FUD1521',
      message: 'FUD0051 is an error, and an error cannot be silenced',
      span: S,
    });
  });
});

describe('FUD1522 and FUD1523: the comment itself', () => {
  it('FUD1522 says what is missing and how to write it', () => {
    expect(FUD1522({ span: S, reason: 'it names no code' }).message).toBe(
      'this fud-disable comment silences nothing: it names no code. Write it as `fud-disable-next-line FUD1380: why`',
    );
  });

  it('FUD1523 for one code on the next line, and for two in the file', () => {
    expect(FUD1523({ span: S, codes: ['FUD1380'], scope: 'next-line' })).toEqual({
      severity: 'hint',
      code: 'FUD1523',
      message: 'nothing to silence: FUD1380 does not occur on the next line',
      span: S,
    });
    expect(FUD1523({ span: S, codes: ['FUD1380', 'FUD1022'], scope: 'file' }).message).toBe(
      'nothing to silence: FUD1380, FUD1022 do not occur in this file',
    );
  });
});

describe('FUD1524: a feature newer than the Baseline', () => {
  it('with both dates and the versions that have it (the example of §1.3)', () => {
    const d = FUD1524({
      span: S,
      name: 'field-sizing',
      key: 'css.properties.field-sizing',
      baseline: 'widely available',
      newly: '2026-06-16',
      widely: '2028-12-16',
      support: ['Chrome 123', 'Edge 123', 'Firefox 152', 'Safari 26.2'],
      missing: [],
    });
    expect(d).toEqual({
      severity: 'warning',
      code: 'FUD1524',
      message:
        "`field-sizing` (css.properties.field-sizing) is newer than this project's Baseline (widely available): " +
        'newly available on 2026-06-16, widely available on 2028-12-16. Chrome 123, Edge 123, Firefox 152, Safari 26.2',
      span: S,
    });
  });

  it('newly without widely, and no versions to list', () => {
    expect(
      FUD1524({ span: S, name: 'x', key: 'k', baseline: 'Baseline 2024', newly: '2025-01-01', support: [], missing: [] }).message,
    ).toBe("`x` (k) is newer than this project's Baseline (Baseline 2024): newly available on 2025-01-01");
  });

  it('not in every core browser: which ones are missing', () => {
    expect(
      FUD1524({
        span: S,
        name: 'closedby',
        key: 'html.elements.dialog.closedby',
        baseline: 'newly available',
        newly: null,
        support: ['Chrome 134', 'Firefox 141'],
        missing: ['Safari'],
      }).message,
    ).toBe(
      "`closedby` (html.elements.dialog.closedby) is newer than this project's Baseline (newly available): " +
        'not yet in every core browser (missing Safari). Chrome 134, Firefox 141',
    );
  });
});

describe('FUD1525–FUD1528: the project', () => {
  it('FUD1525: the floor fudic needs', () => {
    expect(
      FUD1525({
        file: F,
        span: S,
        floor: '2024-03-05',
        features: ['declarative-shadow-dom', 'promise-withresolvers'],
        baseline: 'Baseline 2023',
        cutoff: '2023-12-31',
      }),
    ).toEqual({
      severity: 'warning',
      code: 'FUD1525',
      message:
        'fudic needs browsers from 2024-03-05 on (declarative-shadow-dom, promise-withresolvers); Baseline 2023 asks for 2023-12-31',
      file: F,
      span: S,
    });
  });

  it('FUD1526: one per library, with its features', () => {
    expect(FUD1526({ file: F, library: '@acme/ui', features: ['popover', 'field-sizing'] }).message).toBe(
      "`@acme/ui` uses features this app's Baseline does not accept: popover, field-sizing",
    );
  });

  it('FUD1527: unknown, moved, split', () => {
    expect(FUD1527({ file: F, id: 'nada' }).message).toBe('"nada" in "allow" is not a web-features id, so it allows nothing');
    expect(FUD1527({ file: F, id: 'a', kind: 'moved', to: ['b'] }).message).toBe('"a" in "allow" is now "b": it is allowed under that id');
    expect(FUD1527({ file: F, id: 'a', kind: 'split', to: ['b', 'c'] }).message).toBe(
      '"a" in "allow" was split into "b", "c": all of them are allowed',
    );
  });

  it('FUD1528: an allow nothing uses, as a hint', () => {
    expect(FUD1528({ file: F, id: 'popover' })).toEqual({
      severity: 'hint',
      code: 'FUD1528',
      message: '"popover" in "allow" is not used by anything in this project',
      file: F,
    });
  });
});

describe('FUD0725 gains diagnostics and baseline', () => {
  it('diagnostics', () => {
    expect(FUD0725({ file: F, problem: 'diagnostics', reason: 'it is not an object' }).message).toBe(
      'fudic.json "diagnostics" must be an object of "FUDnnnn" or "warnings" to "off", "hint", "info", "warning" or "error": it is not an object',
    );
  });

  it('baseline', () => {
    expect(FUD0725({ file: F, problem: 'baseline', reason: '2014 is before 2015' }).message).toBe(
      'fudic.json "baseline" must be "widely", "newly", a year, or { "target": …, "allow"?: ["feature-id"] }: 2014 is before 2015',
    );
  });
});
