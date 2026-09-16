/**
 * The compactor of BUG-08, at the unit it actually decides things: one literal CSS run.
 *
 * `css.test.ts` owns the acceptance criteria, on the module a component ships. This file
 * owns the edges — the places where "collapse the whitespace" stops being obvious: a
 * comment, a string, a `/` that opens neither, and the two punctuation rules that are
 * deliberately not symmetric.
 */
import { describe, expect, it } from 'vitest';
import { compactCss } from '../../src/emit/css-compact.js';

describe('compactCss — whitespace', () => {
  it('collapses a run of whitespace to a single space', () => {
    expect(compactCss('a  \n\t  b')).toBe('a b');
  });

  it('keeps a leading and a trailing space, because the run may sit next to a part', () => {
    // Never compact ACROSS parts (§4.2): what looks like padding here may be the space
    // that separates `@(size)rem` from the next value. The sheet's own outer whitespace
    // is trimmed once, by `compactStyleCss`.
    expect(compactCss('   rem   ')).toBe(' rem ');
  });

  it('drops the whitespace around a brace and a semicolon', () => {
    expect(compactCss('.a  {  color: red  ;  }')).toBe('.a{color:red;}');
  });

  it('drops the whitespace after a colon', () => {
    expect(compactCss('color:   red')).toBe('color:red');
  });
});

describe('compactCss — what it must not touch', () => {
  it('keeps the space BEFORE a colon, which may be a descendant of a pseudo-class', () => {
    // `a :hover` and `a:hover` are different rules. The byte saved is not worth one.
    expect(compactCss('a :hover  {  color: red  }')).toBe('a :hover{color:red}');
  });

  it('keeps a comment marked as a licence, with the whitespace inside it', () => {
    expect(compactCss('/*!  keep   me  */  .a { }')).toBe('/*!  keep   me  */ .a{}');
  });

  it('keeps an unterminated licence, to the end of the run', () => {
    expect(compactCss('.a { }  /*!  oops')).toBe('.a{}/*!  oops');
  });

  it('keeps the content of a double-quoted string', () => {
    expect(compactCss('content:  "a   b"')).toBe('content:"a   b"');
  });

  it('keeps the content of a single-quoted string', () => {
    expect(compactCss("content:  'a   b'")).toBe("content:'a   b'");
  });

  it('does not end a string on an escaped quote', () => {
    expect(compactCss('content: "a \\"  b"  ;')).toBe('content:"a \\"  b";');
  });

  it('keeps an unterminated string, to the end of the run', () => {
    expect(compactCss('content:  "a   b')).toBe('content:"a   b');
  });

  it('does not read a lone slash as the start of a comment', () => {
    expect(compactCss('grid-area:  1  /  2')).toBe('grid-area:1 / 2');
  });
});

/**
 * BUG-40 §4.6, criteria 11 and 12. BUG-08 §4.3 left dropping comments written down as a
 * SECOND decision, because it would carry a licence away with the prose; it is taken here,
 * and `/*!` is what makes it safe.
 */
describe('compactCss — the prose goes, the licence stays', () => {
  it('drops a comment written for whoever opens the file', () => {
    expect(compactCss('/* the card */ .a { color: red }')).toBe(' .a{color:red}');
  });

  it('drops an unterminated one the same way, to the end of the run', () => {
    expect(compactCss('.a { }  /*  oops')).toBe('.a{}');
  });

  it('drops one sitting inside a declaration block, and leaves the rule standing', () => {
    expect(compactCss('.a { /* why */ color: red; }')).toBe('.a{color:red;}');
  });

  it('keeps the space AROUND a dropped comment: a descendant stays a descendant', () => {
    // `.a .b` and `.a.b` are different rules, and a comment is not a separator. Removing
    // the whitespace with the comment would silently rewrite the selector.
    expect(compactCss('.a /* c */ .b { color: red }')).toBe('.a .b{color:red}');
  });

  it('does not join two selectors that only a comment stood between', () => {
    // No whitespace at all around it: there was nothing separating them to begin with, so
    // `.a.b` is what the author wrote and what has to come out.
    expect(compactCss('.a/* c */.b')).toBe('.a.b');
  });
});
