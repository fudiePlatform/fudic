import { describe, it, expect } from 'vitest';
import { ok, withDiagnostics, collectDiagnostics } from '../../src/types/result.js';
import { errorDiag } from '../../src/types/diagnostic.js';
import { span } from '../../src/types/span.js';

const d = errorDiag('FUD0001', 'boom', span(0, 1));

describe('ok', () => {
  it('wraps a value with no diagnostics', () => {
    expect(ok(42)).toEqual({ value: 42, diagnostics: [] });
  });
});

describe('withDiagnostics', () => {
  it('keeps the value and the diagnostics', () => {
    expect(withDiagnostics('x', [d])).toEqual({ value: 'x', diagnostics: [d] });
  });
});

describe('collectDiagnostics', () => {
  it('concatenates diagnostics in order', () => {
    expect(collectDiagnostics(ok(1), withDiagnostics(2, [d]))).toEqual([d]);
  });

  it('returns empty when there is nothing to collect', () => {
    expect(collectDiagnostics(ok(1), ok(2))).toEqual([]);
  });
});
