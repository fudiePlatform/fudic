import { describe, it, expect } from 'vitest';
import { errorDiag, warningDiag, infoDiag, hintDiag } from '../../src/types/diagnostic.js';
import { span } from '../../src/types/span.js';

describe('diagnostic helpers', () => {
  it('errorDiag carries severity, code, message and span', () => {
    expect(errorDiag('FUD0001', 'something', span(0, 1))).toEqual({
      severity: 'error',
      code: 'FUD0001',
      message: 'something',
      span: { start: 0, end: 1 },
    });
  });

  it('each helper sets the right severity', () => {
    const s = span(0, 1);
    expect(warningDiag('FUD0002', 'w', s).severity).toBe('warning');
    expect(infoDiag('FUD0003', 'i', s).severity).toBe('info');
    expect(hintDiag('FUD0004', 'h', s).severity).toBe('hint');
  });

  it('preserves the code verbatim (no reformatting)', () => {
    expect(errorDiag('not-fud-shaped', 'x', span(0, 0)).code).toBe('not-fud-shaped');
  });
});
