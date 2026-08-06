/**
 * The class names a `.fud` declares (BUG-15 §6.4–§6.9).
 *
 * One rule is under test in every case here: a `.name` counts only in a run of text that ENDS
 * at a `{`. That is what tells a selector from a declaration, and it is why there is no list of
 * exceptions to keep — `url(a.png)` and `0.18rem` are not special-cased anywhere.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { styleClassNames } from '../../src/services/classes.js';
import { memoryFs } from '../_support.js';

const PATH = '/p/components/app-x.fud';

/** A component whose `<head>` holds `css`, and whose `<template>` holds `markup`. */
function componentWith(css: string, markup = '<span><slot></slot></span>'): string {
  return `<head>\n<style>\n${css}\n</style>\n</head>\n\n<app-x>\n  <template shadowrootmode="open">\n${markup}\n  </template>\n</app-x>\n`;
}

/** The names of a `.fud` source. */
function namesOf(source: string, path = PATH): readonly string[] {
  const index = new WorkspaceIndex(memoryFs({ [path]: source }));
  index.scan('/p');
  return styleClassNames(new DocumentCache(index).get(path, 1, source));
}

/** The names of a `<style>` body. */
const names = (css: string): readonly string[] => namesOf(componentWith(css));

describe('§6.4 — a prelude is where a class name lives', () => {
  it.each([
    ['two names in one compound selector', '.badge.success { color: red }', ['badge', 'success']],
    ['a child combinator', '.a > .b { color: red }', ['a', 'b']],
    ['a selector list', '.a, .b { color: red }', ['a', 'b']],
    ['a pseudo-class', '.a:hover { color: red }', ['a']],
    ['a functional pseudo-class', ':not(.foo) { color: red }', ['foo']],
    ['a name that may start with a hyphen', '.-wk { color: red }', ['-wk']],
    ['a non-ASCII name', '.año { color: red }', ['año']],
  ])('%s', (_title, css, expected) => {
    expect(names(css)).toEqual(expected);
  });
});

describe('§6.5 — a declaration is not a prelude', () => {
  it.each([
    ['a decimal with a leading zero', '.a { padding: 0.18rem 0.55rem }'],
    ['a bare decimal', '.a { font-size: .72rem }'],
    ['a string that looks like a selector', '.a { content: ".foo" }'],
    ['a url with an extension', '.a { background: url(bg.png) }'],
    ['a declaration after a semicolon', '.a { color: red; background: url(bg.png) }'],
  ])('%s contributes nothing but the rule it is in', (_title, css) => {
    expect(names(css)).toEqual(['a']);
  });

  it('a `.` followed by a digit opens nothing, prelude or not', () => {
    // `@supports (x: .5)` is a prelude, and `.5` is still not a name: a CSS identifier
    // cannot start with a digit.
    expect(names('@supports (x: .5) { .ok { color: red } }')).toEqual(['ok']);
  });

  it('a lone `.` opens nothing', () => {
    expect(names('.a { color: red } . { }')).toEqual(['a']);
  });
});

describe('§6.6 — nesting and at-rules', () => {
  it('a nested rule is a prelude too (decision 42.e)', () => {
    expect(names('.card { color: red; .title { font-weight: bold } }')).toEqual(['card', 'title']);
  });

  it('an @media contributes what is inside it', () => {
    expect(names('@media (min-width: 40rem) { .wide { display: flex } }')).toEqual(['wide']);
  });

  it('an @scope prelude carries real classes', () => {
    expect(names('@scope (.card) to (.content) { .a { color: red } }')).toEqual([
      'card',
      'content',
      'a',
    ]);
  });
});

describe('§6.7 — comments declare nothing', () => {
  it('skips a commented-out rule, braces and all', () => {
    expect(names('/* .obsoleta { color: red } */\n.a { color: red }')).toEqual(['a']);
  });

  it('survives a comment left open', () => {
    expect(names('.a { color: red }\n/* .never')).toEqual(['a']);
  });

  it('a `/` that opens no comment is just a character', () => {
    expect(names('.a { aspect-ratio: 16/9 }')).toEqual(['a']);
  });
});

describe('§6.8 — Razor inside the CSS', () => {
  it('does not offer the prefix of an interpolated name', () => {
    // `.item-@(n)` is a prefix that dies at the edge of its part: it is not a name.
    expect(names('.item-@(n) { color: red }\n.item { color: blue }')).toEqual(['item']);
  });

  it('a name that ends before the edge of the part still counts', () => {
    expect(names('.a .b@(n) { color: red }')).toEqual(['a']);
  });

  it('a run carries on across a Razor atom', () => {
    expect(names('.a@(n).b { color: red }')).toEqual(['b']);
  });

  it('a `.` that the part ends on opens nothing', () => {
    // The one position where the character after the dot is not a character at all.
    expect(names('.a { color: red }\n.@(n) { color: blue }')).toEqual(['a']);
  });
});

describe('§6.9 — every <style> the file reaches', () => {
  const INLINE = '<style>\n.inline { color: red }\n.badge { color: blue }\n</style>\n<span><slot></slot></span>';

  it('takes the head and the template alike, deduplicated, in order', () => {
    expect(namesOf(componentWith('.badge { color: red }', INLINE))).toEqual(['badge', 'inline']);
  });

  it('finds a <style> nested under an element of the template', () => {
    const markup = `<div><section><style>\n.deep { color: red }\n</style></section>text</div>`;
    expect(namesOf(componentWith('.top { color: red }', markup))).toEqual(['top', 'deep']);
  });
});

describe('the shape of the file', () => {
  it('offers nothing when there is no <style> at all', () => {
    expect(namesOf(`<app-x>\n  <template shadowrootmode="open">\n<span></span>\n  </template>\n</app-x>\n`)).toEqual([]);
  });

  it('offers nothing from a file with no <head> and no <template>', () => {
    expect(namesOf(`<link rel="layout" href="../layouts/_layout.fud">\n<article>hi</article>\n`, '/p/blog/[slug].fud')).toEqual([]);
  });

  it('reads the <head> of a document that has no <template> of its own', () => {
    const route = `<link rel="layout" href="../layouts/_layout.fud">\n<head>\n<style>\n.route { color: red }\n</style>\n</head>\n<article>hi</article>\n`;
    expect(namesOf(route, '/p/blog/[slug].fud')).toEqual(['route']);
  });

  it('drops a prelude the body ends before closing', () => {
    expect(names('.a { color: red }\n.dangling')).toEqual(['a']);
  });

  it('a string left open swallows the rest rather than desynchronising', () => {
    expect(names('.a { content: "unterminated')).toEqual(['a']);
  });

  it('an escaped quote does not end a string', () => {
    expect(names('.a { content: "\\".foo" }\n.b { color: red }')).toEqual(['a', 'b']);
  });
});
