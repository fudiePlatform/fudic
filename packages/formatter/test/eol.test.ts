import { describe, expect, it } from 'vitest';
import { applyEndOfLine, detectEndOfLine, resolveEndOfLine, stripCr } from '../src/eol.js';

describe('detectEndOfLine', () => {
  it('reads the first break of the source', () => {
    expect(detectEndOfLine('a\r\nb\nc')).toBe('crlf');
    expect(detectEndOfLine('a\nb\r\nc')).toBe('lf');
  });

  it('falls back to lf when there is no break to read', () => {
    expect(detectEndOfLine('')).toBe('lf');
    expect(detectEndOfLine('one line')).toBe('lf');
  });

  it('falls back to lf when the file starts with the break', () => {
    // Offset 0 has no character behind it to inspect: there is no \r, so it is lf.
    expect(detectEndOfLine('\nrest')).toBe('lf');
  });
});

describe('applyEndOfLine', () => {
  it('rewrites every break for crlf and touches nothing for lf', () => {
    expect(applyEndOfLine('a\nb\nc', 'crlf')).toBe('a\r\nb\r\nc');
    expect(applyEndOfLine('a\nb\nc', 'lf')).toBe('a\nb\nc');
  });
});

describe('resolveEndOfLine', () => {
  it('passes an explicit terminator through and answers auto from the source', () => {
    expect(resolveEndOfLine('lf', 'a\r\nb')).toBe('lf');
    expect(resolveEndOfLine('crlf', 'a\nb')).toBe('crlf');
    expect(resolveEndOfLine('auto', 'a\r\nb')).toBe('crlf');
  });
});

describe('stripCr', () => {
  it('normalizes both crlf and a lone cr, and returns the text untouched without one', () => {
    expect(stripCr('a\r\nb')).toBe('a\nb');
    expect(stripCr('a\rb')).toBe('a\nb');
    const clean = 'a\nb';
    expect(stripCr(clean)).toBe(clean);
  });
});
