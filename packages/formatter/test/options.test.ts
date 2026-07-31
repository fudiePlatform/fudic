import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, indentUnit, resolveOptions } from '../src/options.js';

describe('resolveOptions', () => {
  it('applies every default when nothing is given', () => {
    expect(resolveOptions('')).toEqual({ ...DEFAULT_OPTIONS, endOfLine: 'lf' });
  });

  it('applies every default when the partial is absent, not just empty', () => {
    expect(resolveOptions('', undefined)).toEqual({ ...DEFAULT_OPTIONS, endOfLine: 'lf' });
  });

  it('overrides only what the caller set', () => {
    const resolved = resolveOptions('', { printWidth: 60, quote: 'single' });
    expect(resolved.printWidth).toBe(60);
    expect(resolved.quote).toBe('single');
    expect(resolved.tabWidth).toBe(DEFAULT_OPTIONS.tabWidth);
    expect(resolved.useTabs).toBe(false);
  });

  it('answers endOfLine: auto against the source, so nothing downstream can ask again', () => {
    expect(resolveOptions('a\r\nb', { endOfLine: 'auto' }).endOfLine).toBe('crlf');
    expect(resolveOptions('a\nb', { endOfLine: 'auto' }).endOfLine).toBe('lf');
  });

  it('keeps an explicit terminator even when the source disagrees', () => {
    expect(resolveOptions('a\r\nb', { endOfLine: 'lf' }).endOfLine).toBe('lf');
    expect(resolveOptions('a\nb', { endOfLine: 'crlf' }).endOfLine).toBe('crlf');
  });
});

describe('indentUnit', () => {
  it('is tabWidth spaces, or one tab', () => {
    expect(indentUnit(resolveOptions(''))).toBe('  ');
    expect(indentUnit(resolveOptions('', { tabWidth: 4 }))).toBe('    ');
    expect(indentUnit(resolveOptions('', { useTabs: true }))).toBe('\t');
  });
});
