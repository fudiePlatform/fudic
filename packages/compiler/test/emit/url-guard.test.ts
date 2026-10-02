/**
 * SDD-51 §3.7 (criteria 15 and 16): a URL attribute whose literal prefix pins the origin is
 * written as it always was; one whose prefix does not goes through `$dom.setUrl`, the guard.
 */

import { describe, expect, it } from 'vitest';
import { resolveComponents, emitComponentModule } from '../../src/emit/index.js';
import { memoryIo } from './_support.js';

const CODE = '  const url = "/x";\n  const id = 1;\n  const x = "a";\n  const base = "/b";\n';

/** The server module of a component whose template is `template`. */
function server(template: string): string {
  const io = memoryIo({
    '/page.fud': '<link rel="component" href="./x-own.fud">\n<html><head></head><body><x-own></x-own></body></html>\n',
    '/x-own.fud': `@code {\n${CODE}}\n<x-own>\n  <template shadowrootmode="open">${template}</template>\n</x-own>\n`,
  });
  const graph = resolveComponents('/page.fud', io);
  return emitComponentModule(graph, graph.components.get('x-own')!, {});
}

describe('a prefix that pins the origin: written as it is (criterion 15)', () => {
  it.each([
    '<a href="/posts/@id">a</a>',
    '<a href=@(`/p/${id}`)>a</a>',
    '<a href="#@id">a</a>',
    '<a href="https://x.com/@id">a</a>',
    '<a href="./@id">a</a>',
    '<a href="?q=@id">a</a>',
    '<img alt="" src="data:image/png;base64,@x">',
  ])('%s', (template) => {
    const src = server(template);
    expect(src).not.toContain('$dom.setUrl');
    expect(src).toContain('$dom.setAttr');
  });
});

describe('a prefix that does not: through the guard (criterion 16)', () => {
  it.each([
    '<a href="@url">a</a>',
    '<a href=@(`/${x}`)>a</a>',
    '<img alt="" src=@(base + "/a.png")>',
    '<a href="//@x">a</a>',
    '<a href="/\\@x">a</a>',
    '<a href=" /@x">a</a>',
    '<a href="javascript:@x">a</a>',
    '<a href="data:@x">a</a>',
    '<a href=@(`/a` + x)>a</a>',
    // A backslash ends the readable head where it stands: no prefix, so guarded.
    '<a href=@(`\\/${x}`)>a</a>',
    // The lists: a prefix says something about the first URL only (§3.8).
    '<img alt="" srcset="/a.png 1x, @x 2x">',
    '<link rel="preload" as="image" imagesrcset="/a.png 1x, @x 2x">',
    '<a href="/a" ping="/p @x">a</a>',
    '<object data=@url></object>',
  ])('%s', (template) => {
    expect(server(template)).toContain('$dom.setUrl');
  });

  it('only on the URL attributes', () => {
    expect(server('<p title=@url>a</p><object data-x=@url></object>')).not.toContain('$dom.setUrl');
  });
});
