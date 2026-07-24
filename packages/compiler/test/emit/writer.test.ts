/**
 * CodeWriter — the indentation-aware line writer behind every emitter. A small pure
 * utility, so this aims for full coverage of its branches.
 */
import { describe, expect, it } from 'vitest';
import { CodeWriter } from '../../src/emit/index.js';

describe('CodeWriter', () => {
  it('writes lines joined by \\n', () => {
    const w = new CodeWriter();
    w.line('a');
    w.line('b');
    expect(w.toString()).toBe('a\nb');
  });

  it('renders line() with no argument as a truly blank line (no indentation)', () => {
    const w = new CodeWriter();
    w.indent();
    w.line('a');
    w.line(); // blank even while indented
    w.line('b');
    expect(w.toString()).toBe('  a\n\n  b');
  });

  it('indents two spaces per level', () => {
    const w = new CodeWriter();
    w.line('l0');
    w.indent().line('l1');
    w.indent().line('l2');
    expect(w.toString()).toBe('l0\n  l1\n    l2');
  });

  it('dedent() returns to the previous level', () => {
    const w = new CodeWriter();
    w.indent().indent().line('deep');
    w.dedent().line('mid');
    w.dedent().line('top');
    expect(w.toString()).toBe('    deep\n  mid\ntop');
  });

  it('dedent() below zero clamps at zero', () => {
    const w = new CodeWriter();
    w.dedent().dedent(); // already at 0
    w.line('x');
    expect(w.toString()).toBe('x');
  });

  it('chains: every mutator returns this', () => {
    const w = new CodeWriter();
    expect(w.line('a')).toBe(w);
    expect(w.indent()).toBe(w);
    expect(w.dedent()).toBe(w);
  });

  it('a fresh writer stringifies to the empty string', () => {
    expect(new CodeWriter().toString()).toBe('');
  });
});
