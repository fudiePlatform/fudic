import { describe, expect, it } from 'vitest';
import { resolveOptions } from '../../src/options.js';
import {
  breakParent,
  concat,
  fill,
  group,
  hardline,
  indent,
  line,
  printDoc,
  softline,
  type Doc,
} from '../../src/doc/index.js';

/** Print with a deliberately small margin: that is where the decisions become visible. */
const print = (doc: Doc, printWidth = 20, extra: Record<string, unknown> = {}): string =>
  printDoc(doc, resolveOptions('', { printWidth, ...extra }));

describe('groups', () => {
  it('prints flat when it fits and broken when it does not', () => {
    const doc = group(concat(['[', indent(concat([softline, 'a', ',', line, 'b'])), softline, ']']));
    expect(print(doc)).toBe('[a, b]');
    expect(print(doc, 4)).toBe('[\n  a,\n  b\n]');
  });

  it('measures what is already queued behind the group, not the group alone', () => {
    // The group is 6 columns and the tail is 8: flat at 20, broken at 12.
    const doc = concat([group(concat(['(', line, 'x', line, ')'])), '12345678']);
    expect(print(doc, 20)).toBe('( x )12345678');
    expect(print(doc, 12)).toBe('(\nx\n)12345678');
  });

  it('never measures a group that must break', () => {
    expect(print(group(concat(['a', hardline, 'b'])), 100)).toBe('a\nb');
    expect(print(group(concat(['a', line, 'b']), { shouldBreak: true }), 100)).toBe('a\nb');
  });

  it('a break-parent prints nothing and opens its group', () => {
    expect(print(group(concat(['a', line, 'b', breakParent])), 100)).toBe('a\nb');
  });
});

describe('indentation', () => {
  it('nests, and is spaces or tabs as the options say', () => {
    const doc = concat(['<a>', indent(concat([hardline, '<b>', indent(concat([hardline, 'x']))])), hardline, '</a>']);
    expect(print(doc, 100)).toBe('<a>\n  <b>\n    x\n</a>');
    expect(print(doc, 100, { useTabs: true })).toBe('<a>\n\t<b>\n\t\tx\n</a>');
    expect(print(doc, 100, { tabWidth: 4 })).toBe('<a>\n    <b>\n        x\n</a>');
  });

  it('leaves no trailing whitespace on a line a break would have padded', () => {
    expect(print(concat([indent(concat(['a', hardline])), 'b']), 100)).toBe('a\n  b');
    expect(print(concat([indent(concat([hardline, hardline, 'a']))]), 100)).toBe('\n\n  a');
    expect(print(concat(['  ', hardline, 'x']), 100)).toBe('\nx');
    expect(print(concat(['a  ', hardline, 'b']), 100)).toBe('a\nb');
  });

  it('trims the tail of the document too', () => {
    expect(print(concat(['a', indent('  ')]), 100)).toBe('a');
  });
});

describe('lines', () => {
  it('a soft line is nothing when flat and a break when open', () => {
    expect(print(group(concat(['a', softline, 'b'])), 100)).toBe('ab');
    expect(print(group(concat(['a', softline, 'b']), { shouldBreak: true }), 100)).toBe('a\nb');
  });

  it('a normal line is a space when flat', () => {
    expect(print(group(concat(['a', line, 'b'])), 100)).toBe('a b');
  });
});

describe('literal newlines in text', () => {
  it('reset the column and force the ancestors open', () => {
    // The opaque region is the case: copied verbatim, it carries its own newlines and the
    // width bookkeeping has to follow it.
    const doc = group(concat(['<pre>', 'one\ntwo', '</pre>', line, 'after']));
    expect(print(doc, 10)).toBe('<pre>one\ntwo</pre>\nafter');
  });
});

describe('fill', () => {
  const words = (list: readonly string[]): Doc => {
    const parts: Doc[] = [];
    for (const [i, word] of list.entries()) {
      if (i > 0) parts.push(line);
      parts.push(word);
    }
    return fill(parts);
  };

  it('is empty when it has no parts', () => {
    expect(print(fill([]), 10)).toBe('');
  });

  it('packs as many pieces per line as fit', () => {
    expect(print(words(['aaa', 'bbb', 'ccc', 'ddd']), 8)).toBe('aaa bbb\nccc ddd');
    expect(print(words(['aaa', 'bbb', 'ccc', 'ddd']), 100)).toBe('aaa bbb ccc ddd');
  });

  it('breaks the separator when the pair does not fit, and again when the content does not', () => {
    expect(print(words(['aaaa', 'bbbb']), 6)).toBe('aaaa\nbbbb');
    expect(print(words(['aaaaaaaaaa', 'b']), 4)).toBe('aaaaaaaaaa\nb');
  });

  it('handles a lone content, fitting or not', () => {
    expect(print(fill(['abc']), 100)).toBe('abc');
    expect(print(fill([group(concat(['a', line, 'b']))]), 2)).toBe('a\nb');
  });

  it('handles a trailing separator with no content after it', () => {
    // The flat separator is a space, and the tail trim takes it: no line ends in blanks.
    expect(print(fill(['abc', line]), 100)).toBe('abc');
    expect(print(fill(['aaaaaaaaaa', line]), 4)).toBe('aaaaaaaaaa\n');
  });

  it('measures a content that already carries a newline', () => {
    expect(print(fill(['a\nbb', line, 'c']), 4)).toBe('a\nbb c');
    expect(print(fill(['aaaaa\nb', line, 'c']), 3)).toBe('aaaaa\nb\nc');
  });

  it('sees an inner group that must break, and stops measuring there', () => {
    const forced = group(concat(['x', hardline, 'y']));
    expect(print(fill([forced, line, 'z']), 100)).toBe('x\ny z');
  });

  it('sees a break-parent inside its content without treating it as width', () => {
    expect(print(fill([concat(['a', breakParent]), line, 'b']), 100)).toBe('a b');
  });

  it('measures an indent and a nested fill inside its content', () => {
    expect(print(fill([indent(concat(['a', softline, 'b'])), line, 'c']), 100)).toBe('ab c');
    expect(print(fill([fill(['a', line, 'b']), line, 'c']), 100)).toBe('a b c');
  });
});
