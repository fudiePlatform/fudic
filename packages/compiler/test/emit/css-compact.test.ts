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

  it('keeps a comment, with the whitespace inside it', () => {
    expect(compactCss('/*!  keep   me  */  .a { }')).toBe('/*!  keep   me  */ .a{}');
  });

  it('keeps an unterminated comment, to the end of the run', () => {
    expect(compactCss('.a { }  /*  oops')).toBe('.a{}/*  oops');
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
