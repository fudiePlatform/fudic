import { describe, expect, it } from 'vitest';
import {
  breakParent,
  breaksOf,
  concat,
  empty,
  fill,
  group,
  hardline,
  indent,
  join,
  line,
  softline,
} from '../../src/doc/index.js';

describe('breaksOf', () => {
  it('reads a literal newline in text: an opaque region breaks its ancestors by itself', () => {
    expect(breaksOf('one line')).toBe(false);
    expect(breaksOf('two\nlines')).toBe(true);
  });

  it('reads the flag on every node', () => {
    expect(breaksOf(line)).toBe(false);
    expect(breaksOf(softline)).toBe(false);
    expect(breaksOf(hardline)).toBe(true);
    expect(breaksOf(breakParent)).toBe(true);
    expect(breaksOf(empty)).toBe(false);
  });
});

describe('propagation on construction', () => {
  it('a concat breaks when any part does', () => {
    expect(concat(['a', 'b']).breaks).toBe(false);
    expect(concat(['a', hardline]).breaks).toBe(true);
  });

  it('a fill breaks when any part does', () => {
    expect(fill(['a', line, 'b']).breaks).toBe(false);
    expect(fill(['a', hardline, 'b']).breaks).toBe(true);
  });

  it('an indent breaks with its contents', () => {
    expect(indent('a').breaks).toBe(false);
    expect(indent(hardline).breaks).toBe(true);
  });

  it('a group resolves shouldBreak from its contents, and says so upwards', () => {
    const flat = group(concat(['a', line, 'b']));
    expect(flat.shouldBreak).toBe(false);
    expect(flat.breaks).toBe(false);

    const forced = group('a', { shouldBreak: true });
    expect(forced.shouldBreak).toBe(true);
    expect(forced.breaks).toBe(true);

    const hard = group(concat(['a', hardline]));
    expect(hard.shouldBreak).toBe(true);

    // A broken child emits a newline, so no ancestor can be flat: propagation is not an
    // optimization here, it is the only correct answer.
    expect(group(concat(['x', hard])).shouldBreak).toBe(true);
    expect(group(concat(['x', 'y']), { shouldBreak: false }).shouldBreak).toBe(false);
  });
});

describe('join', () => {
  it('puts the separator between each pair and nowhere else', () => {
    expect(join(', ', []).parts).toEqual([]);
    expect(join(', ', ['a']).parts).toEqual(['a']);
    expect(join(', ', ['a', 'b', 'c']).parts).toEqual(['a', ', ', 'b', ', ', 'c']);
  });
});
