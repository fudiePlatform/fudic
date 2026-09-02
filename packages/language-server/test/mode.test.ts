/**
 * The role of a `.fud` (SDD-24 §4.5, decision 51 and SDD-21).
 *
 * Read from the document, never from the file name: `_layout.fud` is a convention of the
 * CLI, and the `href` completion filters by what a file IS.
 */

import { describe, expect, it } from 'vitest';
import { contractOf, layoutHrefOf, roleOf, tagOf } from '../src/mode.js';
import { parseFud } from '../src/parse.js';
import { component, LAYOUT, NESTED_LAYOUT, PAGE, route } from './_support.js';

const doc = (source: string) => parseFud(source).document;

describe('roleOf', () => {
  it.each([
    ['a component', component('app-badge'), 'component'],
    ['a standalone page', PAGE, 'page'],
    ['a route', route('../layouts/_layout.fud'), 'route'],
    ['a layout', LAYOUT, 'layout'],
  ])('reads %s', (_label, source, expected) => {
    expect(roleOf(doc(source))).toBe(expected);
  });
});

describe('tagOf', () => {
  it('is the host tag of a component', () => {
    expect(tagOf(doc(component('app-badge')))).toBe('app-badge');
  });

  it.each([
    ['a page', PAGE],
    ['a route', route('../layouts/_layout.fud')],
    ['a layout', LAYOUT],
  ])('is empty for %s: it is not reached by being written as an element', (_label, source) => {
    expect(tagOf(doc(source))).toBe('');
  });
});

describe('layoutHrefOf', () => {
  it('is the href of a route', () => {
    expect(layoutHrefOf(doc(route('../layouts/_layout.fud')))).toBe('../layouts/_layout.fud');
  });

  it('is the parent href of a nested layout (decision 87)', () => {
    expect(layoutHrefOf(doc(NESTED_LAYOUT))).toBe('./_root.fud');
  });

  it.each([
    ['a component', component('app-badge')],
    ['a page', PAGE],
    ['a plain layout', LAYOUT],
  ])('is empty for %s', (_label, source) => {
    expect(layoutHrefOf(doc(source))).toBe('');
  });
});

/**
 * Where a component's own JSDoc is read from (decision 107).
 *
 * The rule is «the first one at the TOP LEVEL of a neutral chunk», and most of what follows is
 * a way of getting the level wrong: a member's doc lives inside braces, and a `{` inside a
 * string is not a brace. With «the first one» alone a prop's doc became the component's
 * description, and the card introduced `<app-input>` as «El id».
 */
describe('the doc of a component', () => {
  /** `code` as the whole `@code` of a component, and the doc its contract reads out of it. */
  const docOf = (code: string): string | undefined => {
    const source =
      `@code {\n${code}\n}\n` +
      `<app-x>\n  <template shadowrootmode="open"><span>x</span></template>\n</app-x>\n`;
    return contractOf(source, doc(source)).doc;
  };

  it('takes the one written beside the declarations', () => {
    expect(docOf('  /** Un input. */\n  const { a } = props<{ a?: string }>();')).toBe('Un input.');
  });

  it('never takes one written on a member of the type', () => {
    expect(
      docOf('  const { a } = props<{\n    /** El id. */\n    a?: string;\n  }>();'),
    ).toBeUndefined();
  });

  it('never takes one written inside a call or an array', () => {
    expect(docOf('  const a = [\n    /** dentro */\n    1,\n  ];')).toBeUndefined();
    expect(docOf('  const a = fn(\n    /** dentro */\n    1,\n  );')).toBeUndefined();
  });

  it('does not count a brace that is inside a string', () => {
    // Without skipping the string that `{` would open a level nothing closes, and every comment
    // after it would read as nested.
    expect(docOf('  const a = "{";\n  /** Después. */\n  const b = 1;')).toBe('Después.');
    expect(docOf("  const a = '{';\n  /** Después. */\n  const b = 1;")).toBe('Después.');
    expect(docOf('  const a = `{`;\n  /** Después. */\n  const b = 1;')).toBe('Después.');
  });

  it('does not end a string at an escaped quote', () => {
    expect(docOf('  const a = "\\"{";\n  /** Después. */\n  const b = 1;')).toBe('Después.');
  });

  it('survives a string nobody closed', () => {
    // Half a string is what every keystroke of writing one looks like, and there is no «after»
    // it to find a doc in. Asking is still safe.
    expect(docOf('  const a = "sin cerrar')).toBeUndefined();
  });

  it('skips a line comment', () => {
    expect(docOf('  // nota\n  /** Después. */\n  const b = 1;')).toBe('Después.');
    expect(docOf('  const a = 1;\n  // hasta el final')).toBeUndefined();
  });

  it('skips a line comment that reaches the end of the chunk with no newline', () => {
    // The file ENDS inside the comment: an unclosed `@code` whose last line has no break after
    // it. There is no newline to jump to, and no doc after it either.
    const source =
      `<app-x>\n  <template shadowrootmode="open"><span>x</span></template>\n</app-x>\n` +
      `@code {\n  // hasta el final`;

    expect(contractOf(source, doc(source)).doc).toBeUndefined();
  });

  it('skips a block comment that is not a JSDoc', () => {
    expect(docOf('  /* nota */\n  /** Después. */\n  const b = 1;')).toBe('Después.');
  });

  it('is not confused by a `/` that opens no comment at all', () => {
    expect(docOf('  const a = 1 / 2;\n  /** Después. */\n  const b = 1;')).toBe('Después.');
  });

  it('survives a comment nobody closed', () => {
    // Everything after an unterminated `/**` IS the comment, so the doc runs to the end of what
    // the parse gave. Ugly and correct: the author is mid-keystroke and nothing is invented.
    expect(docOf('  /** sin cerrar')).toContain('sin cerrar');
    // The same shape without the second star documents nothing at all.
    expect(docOf('  /* sin cerrar')).toBeUndefined();
  });

  it('is undefined when the block holds no comment at all', () => {
    expect(docOf('  const a = 1;')).toBeUndefined();
  });
});
