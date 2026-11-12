/**
 * SDD-83 §3.2: the comments of a `.fud`, each in the language of its region — Razor in the
 * markup, CSS in the `<style>`, JS where Oxc read it.
 */

import { describe, expect, it } from 'vitest';
import { atConstructs, fudComments, JsBatch, parseDocument } from '../../src/index.js';

/** The tree of `source` and an Oxc batch over the `@code` body the test points at. */
function commentsOf(source: string, code?: string): readonly string[] {
  const html = parseDocument(source, { atConstructs }).value;
  const batch = new JsBatch(source);
  if (code !== undefined) {
    const start = source.indexOf(code);
    batch.add('module-statements', { start, end: start + code.length });
  }
  return fudComments(source, html, batch.parse().value).map((c) => c.text);
}

describe('fudComments', () => {
  it('the Razor comments of the markup, however deep, and inside a control block', () => {
    const source = '@* top *@\n<x-a>\n  <template shadowrootmode="open">\n    <p>@* in p *@</p>\n    @if (a) {\n      @* in if *@\n      <b></b>\n    }\n  </template>\n</x-a>\n';
    expect(commentsOf(source)).toEqual(['@* top *@', '@* in p *@', '@* in if *@']);
  });

  it('the CSS comments of a <style>, and not the ones in text', () => {
    const source = '<x-a>\n  <template shadowrootmode="open">\n    <style>/* css */ p { color: red; }</style>\n    <p>/* text */</p>\n  </template>\n</x-a>\n';
    expect(commentsOf(source)).toEqual(['/* css */']);
  });

  it('the JS comments Oxc read, all of them in source order with the rest', () => {
    const body = '\n  // line\n  const a = 1; /* block */\n';
    const source = `@* first *@\n@code {${body}}\n<p></p>\n`;
    expect(commentsOf(source, body)).toEqual(['@* first *@', '// line', '/* block */']);
  });

  it('an HTML comment is not a place for a directive: it reaches the page', () => {
    expect(commentsOf('<!-- html -->\n<p></p>\n')).toEqual([]);
  });
});
