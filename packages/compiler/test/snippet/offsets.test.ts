/**
 * SDD-29 §5 and §6.8 — every position of the expanded source, back in the file it came from.
 *
 * It is what criterion 34 is: an error inside the body of an imported snippet belongs in the
 * snippet's file, not at the `@render` that happened to pull it in. And it is what keeps the
 * source map honest — a position of a body expanded from elsewhere has no line in the file
 * being compiled, so it is anchored at the call instead.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { expandDocument, type Expansion } from '../../src/expand/index.js';
import type { ResolveIo } from '../../src/types/index.js';

function io(files: Record<string, string>): ResolveIo {
  return {
    read(path) {
      const source = files[path];
      if (source === undefined) throw new Error(`no such file: ${path}`);
      return source;
    },
    resolve(fromPath, href) {
      const dir = fromPath.slice(0, fromPath.lastIndexOf('/'));
      return `${dir}/${href.replace(/^\.\//u, '')}`;
    },
  };
}

const ENTRY = '/app/page.fud';
const component = (body: string, head = ''): string =>
  `${head}<app-page><template shadowrootmode="open">${body}</template></app-page>`;

function expand(files: Record<string, string>): Expansion {
  const source = files[ENTRY]!;
  const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
  return expandDocument(ENTRY, source, doc, io(files));
}

const FILES = {
  [ENTRY]: component('<p>@render card(data.title)</p>', '<link rel="snippet" href="./ui.fud">'),
  '/app/ui.fud': '@snippet card(t: string) { <article class="card">@t</article> }',
};

describe('the offset table (§4.10)', () => {
  it('sends a position of the caller back to the caller, character for character', () => {
    const { source, map } = expand(FILES);
    const at = source.indexOf('<app-page>');
    const origin = map.origin(at)!;
    expect(origin.file).toBe(ENTRY);
    expect(origin.literal).toBe(true);
    expect(FILES[ENTRY].slice(origin.offset, origin.offset + 10)).toBe('<app-page>');
  });

  it('sends a position of an expanded body back to the SNIPPET file (criterion 34)', () => {
    const { source, map } = expand(FILES);
    const at = source.indexOf('class="card"');
    const origin = map.origin(at)!;
    expect(origin.file).toBe('/app/ui.fud');
    expect(origin.literal).toBe(true);
    expect(FILES['/app/ui.fud'].slice(origin.offset, origin.offset + 12)).toBe('class="card"');
  });

  it('sends a position of a spliced argument back to the CALLER', () => {
    const { source, map } = expand(FILES);
    const at = source.indexOf('data.title', source.indexOf('class="card"'));
    const origin = map.origin(at)!;
    expect(origin.file).toBe(ENTRY);
    expect(FILES[ENTRY].slice(origin.offset, origin.offset + 10)).toBe('data.title');
  });

  it('anchors text the compiler wrote at the parameter it replaced', () => {
    const files = {
      [ENTRY]: component('<p>@render card(a + b)</p>', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud': '@snippet card(t: string) { <i>@t</i> }',
    };
    const { source, map } = expand(files);
    // The `(` of `@(a + b)` belongs to no file: it is anchored where the parameter was read.
    const at = source.indexOf('@(a + b)');
    const origin = map.origin(at)!;
    expect(origin.literal).toBe(false);
    expect(origin.file).toBe('/app/ui.fud');
    expect(files['/app/ui.fud'].slice(origin.offset, origin.offset + 1)).toBe('t');
  });

  it('gives a span back as one span of one file, clipped to where it starts', () => {
    const { source, map } = expand(FILES);
    const start = source.indexOf('<article');
    const found = map.spanOf({ start, end: start + 8 })!;
    expect(found.file).toBe('/app/ui.fud');
    expect(FILES['/app/ui.fud'].slice(found.span.start, found.span.end)).toBe('<article');
  });

  it('gives every position a place in the file being compiled, for the source map', () => {
    const { source, map } = expand(FILES);
    const own = source.indexOf('<app-page>');
    expect(FILES[ENTRY].slice(map.entryOffset(own), map.entryOffset(own) + 10)).toBe('<app-page>');
    // A position of the expanded body has no line in this file: it answers the `@render`.
    const body = source.indexOf('class="card"');
    const call = FILES[ENTRY].indexOf('@render');
    expect(map.entryOffset(body)).toBe(call);
    // And so does the argument spliced into it, and the text the compiler wrote.
    expect(map.entryOffset(source.indexOf('data.title', body))).toBe(call);
  });

  it('answers the offset it was given when the file was never expanded', () => {
    const source = component('<p>hello</p>');
    const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const { map } = expandDocument(ENTRY, source, doc, io({ [ENTRY]: source }));
    expect(map.entryOffset(7)).toBe(7);
  });

  it('answers nothing for a file that was never expanded', () => {
    const source = component('<p>hello</p>');
    const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const { map } = expandDocument(ENTRY, source, doc, io({ [ENTRY]: source }));
    expect(map.origin(0)).toBeUndefined();
    expect(map.spanOf({ start: 0, end: 1 })).toBeUndefined();
  });

  it('answers the end of the last piece for a position past the end', () => {
    const { source, map } = expand(FILES);
    expect(map.origin(source.length + 100)!.file).toBe(ENTRY);
  });

  it('gives a zero-width span for a position inside text the compiler wrote', () => {
    const files = {
      [ENTRY]: component('<p>@render card()</p>', '<link rel="snippet" href="./ui.fud">'),
      '/app/ui.fud': '@snippet card(t?: string) { <i>@t</i> }',
    };
    const { source, map } = expand(files);
    const at = source.indexOf('undefined');
    const found = map.spanOf({ start: at, end: at + 9 })!;
    expect(found.span.start).toBe(found.span.end);
    expect(found.file).toBe('/app/ui.fud');
  });
});
