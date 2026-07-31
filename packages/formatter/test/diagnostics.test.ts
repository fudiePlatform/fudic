import { describe, expect, it } from 'vitest';
import { span } from '@fudic/compiler';
import {
  FUD_FRAGMENT_NOT_FORMATTED,
  FUD_STYLE_NOT_FORMATTED,
  fragmentNotFormatted,
  styleNotFormatted,
} from '../src/diagnostics.js';

describe('the formatter catalogue', () => {
  it('owns FUD0480–FUD0499, right after the language server', () => {
    expect(FUD_STYLE_NOT_FORMATTED).toBe('FUD0480');
    expect(FUD_FRAGMENT_NOT_FORMATTED).toBe('FUD0481');
  });

  it('reports both as notes, never as errors: the output is complete either way', () => {
    expect(styleNotFormatted(span(0, 10)).severity).toBe('info');
    expect(fragmentNotFormatted(span(0, 10)).severity).toBe('info');
  });

  it('points at the region that was left alone', () => {
    const style = styleNotFormatted(span(4, 40));
    expect(style.span).toEqual({ start: 4, end: 40 });
    expect(style.message).toContain('<style>');

    const fragment = fragmentNotFormatted(span(7, 12));
    expect(fragment.span).toEqual({ start: 7, end: 12 });
    expect(fragment.message).toContain('does not parse');
  });
});
