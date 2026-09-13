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

/**
 * BUG-31 — the writer is the one place that knows the output layout, so it is the one place
 * that can turn a source anchor into a generated offset. Two invariants hold it up: the text
 * a mapped line renders is byte-identical to the plain line it replaces, and an anchor lands
 * where its fragment actually sits in that text.
 */
describe('CodeWriter — mappedLine renders exactly what line() would', () => {
  it('byte for byte, at depth zero', () => {
    const plain = new CodeWriter().line('const x = count();');
    const mapped = new CodeWriter().mappedLine('const x = ', { text: 'count()', src: 40 }, ';');
    expect(mapped.toString()).toBe(plain.toString());
  });

  it('byte for byte, indented, and with the indentation counted once', () => {
    const plain = new CodeWriter().indent().indent().line('return count();');
    const mapped = new CodeWriter()
      .indent()
      .indent()
      .mappedLine('return ', { text: 'count()', src: 40 }, ';');
    expect(mapped.toString()).toBe(plain.toString());
    expect(mapped.toString().startsWith('    return')).toBe(true);
  });

  it('byte for byte over several lines, mapped and plain mixed', () => {
    const parts = ['const a = 1;', 'const b = 2;', 'return a + b;'];
    const plain = new CodeWriter();
    for (const p of parts) plain.line(p);
    const mapped = new CodeWriter()
      .mappedLine({ text: parts[0]!, src: 0 })
      .line(parts[1]!)
      .mappedLine({ text: parts[2]!, src: 30 });
    expect(mapped.toString()).toBe(plain.toString());
  });

  it('the ONE case where the two differ, and it is the writer’s oldest rule', () => {
    // `line('')` is a blank line at indent 0 whatever the depth — the historical output.
    // `mappedLine({text: ''})` is a line with a segment, so it takes the indentation. No
    // statement is empty today, which is exactly why this would rot in silence.
    const w = new CodeWriter().indent();
    expect(w.line('').toString()).toBe('');
    expect(new CodeWriter().indent().mappedLine({ text: '', src: 0 }).toString()).toBe('  ');
  });
});

describe('CodeWriter — where an anchor lands', () => {
  it('a fragment maps at the column it starts on', () => {
    const w = new CodeWriter().mappedLine('const x = ', { text: 'count()', src: 40 }, ';');
    expect(w.mappings()).toEqual([{ generatedOffset: 'const x = '.length, sourceOffset: 40 }]);
  });

  it('the indentation is part of that column', () => {
    const w = new CodeWriter().indent().mappedLine('return ', { text: 'count()', src: 40 });
    expect(w.mappings()).toEqual([{ generatedOffset: 2 + 'return '.length, sourceOffset: 40 }]);
  });

  it('an anchor INSIDE the fragment lands at the fragment’s offset plus its own', () => {
    const w = new CodeWriter().mappedLine('let v = ', {
      text: 'a + b',
      src: 100,
      anchors: [
        { at: 0, src: 100, name: 'a' },
        { at: 4, src: 104, name: 'b' },
      ],
    });
    expect(w.mappings()).toEqual([
      { generatedOffset: 8, sourceOffset: 100 },
      { generatedOffset: 8, sourceOffset: 100, name: 'a' },
      { generatedOffset: 12, sourceOffset: 104, name: 'b' },
    ]);
  });

  it('an anchor with no name comes out without one, rather than with `undefined`', () => {
    // `exactOptionalPropertyTypes`: the field is absent, not present and undefined — and a
    // serializer that writes `"name": undefined` produces a map no tool will read.
    const w = new CodeWriter().mappedLine({ text: 'x', src: 7, anchors: [{ at: 0, src: 7 }] });
    expect(w.mappings()).toEqual([
      { generatedOffset: 0, sourceOffset: 7 },
      { generatedOffset: 0, sourceOffset: 7 },
    ]);
    expect(w.mappings().every((m) => !('name' in m))).toBe(true);
  });

  it('offsets accumulate across lines, counting the newline that joins them', () => {
    const w = new CodeWriter()
      .mappedLine({ text: 'aaa', src: 1 })
      .mappedLine({ text: 'bbb', src: 2 });
    expect(w.mappings()).toEqual([
      { generatedOffset: 0, sourceOffset: 1 },
      { generatedOffset: 4, sourceOffset: 2 }, // 'aaa' + '\n'
    ]);
  });

  it('a blank line still advances the offset by its newline', () => {
    const w = new CodeWriter().line('ab').line('').mappedLine({ text: 'c', src: 9 });
    expect(w.mappings()).toEqual([{ generatedOffset: 4, sourceOffset: 9 }]); // 'ab\n' + '\n'
  });

  it('a plain line carries no mapping at all', () => {
    expect(new CodeWriter().line('const x = 1;').mappings()).toEqual([]);
  });
});

describe('CodeWriter — appendWriter keeps the anchors', () => {
  it('carries a mapped line through the copy', () => {
    // This is the whole reason the method exists: `other.toString().split('\n')` would
    // render the same bytes and lose every anchor, in silence.
    const inner = new CodeWriter().mappedLine('let v = ', {
      text: 'count()',
      src: 50,
      anchors: [{ at: 0, src: 50, name: 'count' }],
    });
    const outer = new CodeWriter().line('function f() {').indent().appendWriter(inner);
    expect(outer.toString()).toBe('function f() {\n  let v = count()');
    expect(outer.mappings()).toEqual([
      { generatedOffset: 15 + 2 + 'let v = '.length, sourceOffset: 50 },
      { generatedOffset: 15 + 2 + 'let v = '.length, sourceOffset: 50, name: 'count' },
    ]);
  });

  it('re-indents the copied lines by the current depth', () => {
    const inner = new CodeWriter().line('a').indent().line('b');
    const outer = new CodeWriter().indent().appendWriter(inner);
    expect(outer.toString()).toBe('  a\n    b');
  });

  it('a blank line stays blank through the copy, whatever the depth', () => {
    const inner = new CodeWriter().line('a').line('').line('b');
    const outer = new CodeWriter().indent().appendWriter(inner);
    expect(outer.toString()).toBe('  a\n\n  b');
  });

  it('copying an empty writer changes nothing', () => {
    const outer = new CodeWriter().line('a');
    expect(outer.appendWriter(new CodeWriter()).toString()).toBe('a');
  });
});

