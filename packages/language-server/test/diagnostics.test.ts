/**
 * The server's own catalogue (SDD-24 §4.4): two codes, both carrying the span that makes
 * them actionable — an error without a location is not a diagnostic in an editor.
 */

import { describe, expect, it } from 'vitest';
import { span } from '@fudic/compiler';
import {
  FUD_HREF_UNRESOLVED,
  FUD_RESERVED_DOLLAR,
  hrefUnresolved,
  reservedDollar,
} from '../src/diagnostics.js';

describe('catalogue', () => {
  it('lives in the range the SDD reserves', () => {
    for (const code of [FUD_HREF_UNRESOLVED, FUD_RESERVED_DOLLAR]) {
      const number = Number(code.slice(3));
      expect(code).toMatch(/^FUD\d{4}$/);
      expect(number).toBeGreaterThanOrEqual(460);
      expect(number).toBeLessThanOrEqual(479);
    }
  });
});

describe('hrefUnresolved', () => {
  it('reports on the attribute value with the href in the message', () => {
    const diagnostic = hrefUnresolved('../components/missing.fud', span(10, 35));

    expect(diagnostic).toEqual({
      severity: 'error',
      code: FUD_HREF_UNRESOLVED,
      message: 'Cannot resolve "../components/missing.fud" to a .fud file',
      span: { start: 10, end: 35 },
    });
  });
});

describe('reservedDollar', () => {
  it('names the offending identifier', () => {
    const diagnostic = reservedDollar('$x', span(4, 6));

    expect(diagnostic.severity).toBe('error');
    expect(diagnostic.code).toBe(FUD_RESERVED_DOLLAR);
    expect(diagnostic.message).toContain('"$x" is reserved');
    expect(diagnostic.span).toEqual({ start: 4, end: 6 });
  });
});
