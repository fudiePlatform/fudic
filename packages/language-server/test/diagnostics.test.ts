/**
 * The server's own catalogue (SDD-24 §4.4): two codes, both carrying the span that makes
 * them actionable — an error without a location is not a diagnostic in an editor.
 */

import { describe, expect, it } from 'vitest';
import { FUD0460, FUD0461, span } from '@fudic/diagnostics';

describe('catalogue', () => {
  it('lives in the range the SDD reserves', () => {
    const codes = [FUD0460({ span: span(0, 1), href: 'x' }).code, FUD0461({ span: span(0, 1), name: '$x' }).code];
    for (const code of codes) {
      const number = Number(code.slice(3));
      expect(code).toMatch(/^FUD\d{4}$/);
      expect(number).toBeGreaterThanOrEqual(460);
      expect(number).toBeLessThanOrEqual(479);
    }
  });
});

describe('FUD0460 — an href that resolves to nothing', () => {
  it('reports on the attribute value with the href in the message', () => {
    const diagnostic = FUD0460({ href: '../components/missing.fud', span: span(10, 35) });

    expect(diagnostic).toEqual({
      severity: 'error',
      code: 'FUD0460',
      message: 'Cannot resolve "../components/missing.fud" to a .fud file',
      span: { start: 10, end: 35 },
    });
  });
});

describe('FUD0461 — a reserved `$` identifier', () => {
  it('names the offending identifier', () => {
    const diagnostic = FUD0461({ name: '$x', span: span(4, 6) });

    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.code).toBe('FUD0461');
    expect(diagnostic.message).toContain('"$x" is reserved');
    expect(diagnostic.span).toEqual({ start: 4, end: 6 });
  });
});
