/**
 * BUG-22 §5 — commenting, one region at a time.
 *
 * The delimiters come from the server; what is asserted here is the toggle over the text, which
 * is the half that has to be right whichever region it was asked about.
 */

import { describe, expect, it } from 'vitest';
import { toggleComment } from '../src/comment.js';
import type { CommentSyntax } from '../src/ports.js';

const RAZOR: CommentSyntax = {
  block: ['@*', '*@'],
  removes: [
    ['@*', '*@'],
    ['<!--', '-->'],
  ],
};

const TS: CommentSyntax = { line: '//', block: ['/*', '*/'], removes: [['/*', '*/']] };

const CSS: CommentSyntax = {
  block: ['/*', '*/'],
  removes: [
    ['/*', '*/'],
    ['@*', '*@'],
  ],
};

/** Toggle over every line of `source`, and give the document back. */
function toggle(source: string, syntax: CommentSyntax, first = 0, last?: number): string {
  const lines = source.split('\n');
  const lastLine = last ?? lines.length - 1;
  const edit = toggleComment(lines, first, lastLine, syntax);

  return [...lines.slice(0, edit.firstLine), ...edit.newLines, ...lines.slice(edit.lastLine + 1)].join(
    '\n',
  );
}

describe('a region with a line comment', () => {
  it('comments every line at the shared indent', () => {
    expect(toggle('  const a = 1;\n  const b = 2;', TS)).toBe('  // const a = 1;\n  // const b = 2;');
  });

  it('lines up with the least indented line, not with each line', () => {
    // Commenting a block and uncommenting it has to give the block back, indentation included.
    expect(toggle('  if (a) {\n    b();\n  }', TS)).toBe('  // if (a) {\n  //   b();\n  // }');
  });

  it('leaves a blank line blank: a comment on nothing is noise in the diff', () => {
    expect(toggle('  const a = 1;\n\n  const b = 2;', TS)).toBe(
      '  // const a = 1;\n\n  // const b = 2;',
    );
  });

  it('uncomments when every written line is already commented', () => {
    expect(toggle('  // const a = 1;\n  // const b = 2;', TS)).toBe('  const a = 1;\n  const b = 2;');
  });

  it('comments the lot when only some of them are', () => {
    expect(toggle('  // const a = 1;\n  const b = 2;', TS)).toBe(
      '  // // const a = 1;\n  // const b = 2;',
    );
  });

  it('takes off a comment written without the space', () => {
    // A toggle that only undoes its own work is a toggle that fights the author.
    expect(toggle('//const a = 1;', TS)).toBe('const a = 1;');
  });

  it('uncomments across a blank line, which carries no token to remove', () => {
    expect(toggle('// a\n\n// b', TS)).toBe('a\n\nb');
  });

  it('leaves a selection of nothing but blank lines alone', () => {
    // The same rule as above, taken to its end: there is nothing there to comment, and a `//`
    // on an empty line is a line in the diff that says nothing.
    expect(toggle('\n\n', TS)).toBe('\n\n');
  });
});

describe('markup, where both comments are legal', () => {
  it('writes the Razor one: commenting code out must not ship it', () => {
    expect(toggle('  <p>hola</p>', RAZOR)).toBe('  @* <p>hola</p> *@');
  });

  it('wraps a whole selection once, not line by line', () => {
    expect(toggle('  <p>a</p>\n  <p>b</p>', RAZOR)).toBe('  @* <p>a</p>\n  <p>b</p> *@');
  });

  it('takes its own comment off again', () => {
    expect(toggle('  @* <p>hola</p> *@', RAZOR)).toBe('  <p>hola</p>');
  });

  it('takes off an HTML comment the author wrote on purpose', () => {
    expect(toggle('  <!-- hola -->', RAZOR)).toBe('  hola');
  });

  it('takes one off that was written without the spaces', () => {
    expect(toggle('  @*<p>hola</p>*@', RAZOR)).toBe('  <p>hola</p>');
  });

  it('is not fooled by a comment too short to hold both delimiters', () => {
    expect(toggle('  @*@', RAZOR)).toBe('  @* @*@ *@');
  });

  it('does not mistake a line that merely contains one for a commented line', () => {
    expect(toggle('  <p>a</p> <!-- why -->', RAZOR)).toBe('  @* <p>a</p> <!-- why --> *@');
  });
});

describe('a <style> body', () => {
  it('takes the CSS block, because CSS has no line comment', () => {
    expect(toggle('  .a { color: red }', CSS)).toBe('  /* .a { color: red } */');
  });

  it('and removes a Razor comment too, which a style body also accepts', () => {
    expect(toggle('  @* .a { color: red } *@', CSS)).toBe('  .a { color: red }');
  });
});

describe('the lines it touches', () => {
  it('is exactly the selected range, and nothing around it', () => {
    const source = '<p>a</p>\n<p>b</p>\n<p>c</p>';

    expect(toggle(source, RAZOR, 1, 1)).toBe('<p>a</p>\n@* <p>b</p> *@\n<p>c</p>');
  });
});
