/**
 * SDD-70 §3.9 and criterion 28 — `buffer <bytes>` on the `load` line: a whole number of bytes,
 * `k` for 1024; anything else is `FUD1325`, and the value is consumed with it.
 */

import { describe, expect, it } from 'vitest';
import type { LoadDecl } from '../src/index.js';
import { formatApi, parseApi } from '../src/index.js';
import { codes, only, slice } from './helpers.js';

const loadOf = (source: string): LoadDecl => parseApi(source).value.declarations.find((d) => d.kind === 'load') as LoadDecl;

describe('`buffer` on the `load` line (SDD-70 §3.9)', () => {
  it('reads bytes, and `k` as 1024', () => {
    expect(codes('load ssr buffer 0')).toEqual([]);
    expect(loadOf('load ssr buffer 0').buffer!.bytes).toBe(0);
    expect(loadOf('load buffer 4096').buffer!.bytes).toBe(4096);
    const source = 'load sw ttl 5m buffer 16k cache-first';
    expect(codes(source)).toEqual([]);
    const load = loadOf(source);
    expect(load.buffer!.bytes).toBe(16384);
    expect(slice(source, load.buffer!.span)).toBe('buffer 16k');
    expect(slice(source, load.buffer!.keyword)).toBe('buffer');
    expect(load.policy!.text).toBe('cache-first');
  });

  it('without `buffer`, no option', () => {
    expect('buffer' in loadOf('load ssr')).toBe(false);
  });

  it.each(['-1', 'x', '1.5', '08', '16K', '4kb'])('`buffer %s` is FUD1325 on the value', (value) => {
    const source = `load buffer ${value} sw`;
    const d = only(source);
    expect(d.code).toBe('FUD1325');
    expect(slice(source, d.span)).toBe(value);
    expect('buffer' in loadOf(source)).toBe(false);
    // The value went with `buffer`: what follows it is still read.
    expect(loadOf(source).mode!.text).toBe('sw');
  });

  it('`buffer` with nothing behind it is FUD1325 on the word', () => {
    const source = 'load ssr buffer';
    const d = only(source);
    expect(d.code).toBe('FUD1325');
    expect(slice(source, d.span)).toBe('buffer');
  });

  it('a second `buffer` is a repeated clause, and the first one stays', () => {
    const source = 'load buffer 0 buffer 16k';
    const d = only(source);
    expect(d.code).toBe('FUD1071');
    expect(loadOf(source).buffer!.bytes).toBe(0);
  });

  it('the formatter keeps the line', () => {
    expect(formatApi('load   ssr   buffer   16k\n  title  str\n')).toBe('load ssr buffer 16k\n  title  str\n');
  });
});
