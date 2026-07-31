import { describe, expect, it } from 'vitest';
import { concat, group, printDoc } from '../../src/doc/index.js';
import { gapDoc, gapOf, NO_GAP, sequenceOf } from '../../src/space/index.js';
import { options, parse } from '../_support.js';

/**
 * Print a gap between two markers. Alone it would meet the printer's tail trim, which is
 * about lines, not about runs: a run is what sits BETWEEN two pieces of content.
 */
const show = (doc: ReturnType<typeof gapDoc>): string =>
  printDoc(concat(['|', doc, '|']), options()).replace(/\n/g, '⏎').slice(1, -1);

describe('gapOf', () => {
  it('reads presence, newline and blank line', () => {
    expect(gapOf('')).toEqual(NO_GAP);
    expect(gapOf(' ')).toEqual({ present: true, hasNewline: false, hasBlankLine: false });
    expect(gapOf('\n  ')).toEqual({ present: true, hasNewline: true, hasBlankLine: false });
    expect(gapOf('\n\n  ')).toEqual({ present: true, hasNewline: true, hasBlankLine: true });
  });
});

describe('gapDoc — the invariant, read top to bottom', () => {
  it('absent stays absent, in every context', () => {
    expect(show(gapDoc(NO_GAP, { breakable: true, edge: false }))).toBe('');
    expect(show(gapDoc(NO_GAP, { breakable: false, edge: true }))).toBe('');
  });

  it('a blank line survives as exactly one', () => {
    expect(show(gapDoc(gapOf('\n\n\n\n'), { breakable: true, edge: false }))).toBe('⏎⏎');
  });

  it('but not at the edge of a block: those are removed', () => {
    expect(show(gapDoc(gapOf('\n\n'), { breakable: true, edge: true }))).toBe('⏎');
  });

  it('a newline stays a newline', () => {
    expect(show(gapDoc(gapOf('\n   '), { breakable: false, edge: false }))).toBe('⏎');
  });

  it('a plain run is a break opportunity where that is allowed, and a space where it is not', () => {
    const breakable = gapDoc(gapOf('   '), { breakable: true, edge: false });
    const sticky = gapDoc(gapOf('   '), { breakable: false, edge: false });
    const between = (doc: typeof breakable, printWidth: number): string =>
      printDoc(group(concat(['|', doc, '|'])), options({ printWidth }));

    // On a line with room, both are one space.
    expect(between(breakable, 100)).toBe('| |');
    expect(between(sticky, 100)).toBe('| |');
    // Past the margin, only the breakable one gives way. Inside inline content §4.5 asks
    // for a long line rather than a reflowed one.
    expect(between(breakable, 2)).toBe('|\n|');
    expect(between(sticky, 2)).toBe('| |');
  });
});

describe('sequenceOf', () => {
  const seq = (source: string) => sequenceOf(parse(source).children);

  it('reads the runs between elements', () => {
    const s = seq('<a></a> <b></b>');
    expect(s.items).toHaveLength(2);
    expect(s.gaps.map((g) => g.present)).toEqual([true]);
    expect(s.leading).toEqual(NO_GAP);
    expect(s.trailing).toEqual(NO_GAP);
  });

  it('reads no run where there is none — the one thing that may not change', () => {
    // This is `@data.tag</app-badge>`: nothing to rewrite, so nothing can break.
    const s = seq('<b></b><i></i>');
    expect(s.gaps.map((g) => g.present)).toEqual([false]);
  });

  it('splits a text node into words, and gives its whitespace to the runs on either side', () => {
    const s = seq('  hello   world  ');
    expect(s.items).toEqual([
      { kind: 'word', text: 'hello' },
      { kind: 'word', text: 'world' },
    ]);
    expect(s.leading.present).toBe(true);
    expect(s.trailing.present).toBe(true);
    expect(s.gaps[0]?.present).toBe(true);
  });

  it('joins the whitespace of adjacent text and elements into one run', () => {
    const s = seq('<p>\n  a @x\n</p>');
    const inner = s.items[0]!;
    const children = inner.kind === 'node' && inner.node.type === 'element' ? inner.node.children : [];
    const body = sequenceOf(children);
    expect(body.leading).toEqual({ present: true, hasNewline: true, hasBlankLine: false });
    expect(body.items.map((i) => i.kind)).toEqual(['word', 'node']);
    expect(body.trailing.hasNewline).toBe(true);
  });

  it('has an empty sequence for no children at all', () => {
    expect(sequenceOf([])).toEqual({ leading: NO_GAP, items: [], gaps: [], trailing: NO_GAP });
  });
});

describe('the invariant, as a property', () => {
  const sources = [
    '<b>a</b><i>b</i>',
    '<b>a</b> <i>b</i>',
    '<div>\n  <p>one</p>\n\n  <p>two</p>\n</div>',
    '<app-badge tone="x">@data.tag</app-badge>',
    'text @x more',
  ];

  it('every gap prints whitespace exactly when the source had some, in any context', () => {
    for (const source of sources) {
      const s = sequenceOf(parse(source).children);
      for (const gap of [s.leading, ...s.gaps, s.trailing]) {
        for (const breakable of [true, false]) {
          for (const edge of [true, false]) {
            const printed = printDoc(concat(['|', gapDoc(gap, { breakable, edge }), '|']), options());
            // A run present in the source prints at least one character between the two
            // markers; a run that was not there prints nothing. Neither direction may fail.
            expect(printed.length > 2).toBe(gap.present);
            expect(printed.slice(1, -1).trim()).toBe('');
          }
        }
      }
    }
  });
});
