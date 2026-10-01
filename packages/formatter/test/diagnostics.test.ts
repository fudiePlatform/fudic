import { describe, expect, it } from 'vitest';
import { FUD0480, FUD0481, span } from '@fudic/diagnostics';

describe('the formatter catalogue', () => {
  it('owns FUD0480–FUD0499, right after the language server', () => {
    expect(FUD0480({ span: span(0, 1) }).code).toBe('FUD0480');
    expect(FUD0481({ span: span(0, 1) }).code).toBe('FUD0481');
  });

  it('reports both as notes, never as errors: the output is complete either way', () => {
    expect(FUD0480({ span: span(0, 10) }).severity).toBe('info');
    expect(FUD0481({ span: span(0, 10) }).severity).toBe('info');
  });

  it('says why a <style> was left alone', () => {
    expect(FUD0480({ span: span(0, 1) }).message).toContain('does not parse as CSS');
  });

  it('points at the region that was left alone', () => {
    const style = FUD0480({ span: span(4, 40) });
    expect(style.span).toEqual({ start: 4, end: 40 });
    expect(style.message).toContain('<style>');

    const fragment = FUD0481({ span: span(7, 12) });
    expect(fragment.span).toEqual({ start: 7, end: 12 });
    expect(fragment.message).toContain('does not parse');
  });
});
