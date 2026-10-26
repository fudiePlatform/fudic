/**
 * SDD-61 decision 163 — `@empty` in the structure of the document (task 4, criterion 16).
 *
 * The parser hangs it off the loop it follows, as an `EmptyBlock` with its span; a misplaced or
 * repeated one is `FUD1149`. Every walk of the compiler that descends a loop's body descends its
 * `@empty` too, as a block of its own and outside the loop.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument, type HtmlContent } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import type { ForeachNode } from '../../src/control/index.js';
import { structureDocument } from '../../src/document/index.js';
import { documentRoots, walk } from '../../src/semantic/index.js';
import { walkBlocks } from '../../src/binding/markers.js';
import { collectDirectives } from '../../src/layout/collect.js';
import { regionAt } from '../../src/region/index.js';
import { batchOf } from '../../src/i18n/extract.js';
import { collectMessages } from '../../src/i18n/index.js';
import { i18nImports } from '../../src/i18n/ast.js';

function parse(source: string): { readonly nodes: readonly HtmlContent[]; readonly codes: readonly string[] } {
  const result = parseDocument(source, { atConstructs });
  return {
    nodes: result.value.children,
    codes: result.diagnostics.map((d) => `${d.code} ${source.slice(d.span.start, d.span.end)}`),
  };
}

const component = (inner: string): string => `<x-a><template shadowrootmode="open">${inner}</template></x-a>`;

function roots(inner: string): readonly HtmlContent[] {
  const source = component(inner);
  return documentRoots(structureDocument(source, parseDocument(source, { atConstructs }).value).value);
}

describe('the parser hangs @empty off its loop', () => {
  for (const head of ['@foreach (const x of xs) key (x)', '@for (let i = 0; i < n; i++) key (i)', '@while (c) key (1)']) {
    it(head.split(' ')[0]!, () => {
      const source = `${head} { <p>a</p> } @* none *@ @empty { <p>none</p> }<i>after</i>`;
      const { nodes, codes } = parse(source);
      expect(codes).toEqual([]);
      const loop = nodes[0] as unknown as ForeachNode;
      expect(loop.empty?.type).toBe('empty-block');
      expect(source.slice(loop.empty!.span.start, loop.empty!.span.end)).toBe('@empty { <p>none</p> }');
      // The loop covers its @empty, as an @if covers its else.
      expect(source.slice(loop.span.start, loop.span.end)).toBe(`${head} { <p>a</p> } @* none *@ @empty { <p>none</p> }`);
      expect(loop.empty!.body.some((n) => n.type === 'element')).toBe(true);
      expect(nodes.at(-1)!.type).toBe('element');
    });
  }

  it('a loop with none has none, and a bare `empty` after it is text', () => {
    const { nodes, codes } = parse('@foreach (const x of xs) key (x) { <p>a</p> } empty');
    expect(codes).toEqual([]);
    expect((nodes[0] as unknown as ForeachNode).empty).toBeUndefined();
  });

  it('an @empty with no body degrades to its keyword, and says why', () => {
    const { nodes, codes } = parse('@foreach (const x of xs) key (x) { <p>a</p> } @empty <p>b</p>');
    const loop = nodes[0] as unknown as ForeachNode;
    expect(loop.empty?.body).toEqual([]);
    expect(codes).toEqual(['FUD0071 ']);
  });
});

describe('a misplaced @empty is FUD1149 (criterion 16)', () => {
  it('after an @if, on its own, or a second time', () => {
    expect(parse('@if (a) { <p>a</p> } @empty { <p>b</p> }').codes).toEqual(['FUD1149 @empty']);
    expect(parse('<p>@empty</p>').codes).toEqual(['FUD1149 @empty']);
    expect(parse('@foreach (const x of xs) key (x) { } @empty { } @empty { <p>b</p> }').codes).toEqual(['FUD1149 @empty']);
  });

  it('after a loop that never got its body', () => {
    expect(parse('@foreach (const x of xs) key (x) @empty { <p>b</p> }').codes).toEqual([
      'FUD0071 ',
      'FUD1149 @empty',
    ]);
  });

  it('a name that only starts with `empty` is still a name', () => {
    expect(parse('<p>@emptyText</p>').codes).toEqual([]);
  });
});

const LOOP = '@foreach (const x of xs) key (x) { <p>a</p> } @empty { <b>none</b> }';

describe('the walks descend into @empty', () => {
  it('the semantic walk, as a block of its own and outside the loop', () => {
    const seen: string[] = [];
    let depth = 0;
    walk(roots(LOOP), {
      enterLoop: () => void depth++,
      exitLoop: () => void depth--,
      enterBlock: (owner) => void seen.push(`enter ${owner.type}`),
      element: (el) => {
        if (el.name === 'p' || el.name === 'b') seen.push(`${el.name} loop=${depth}`);
      },
    });
    expect(seen).toEqual(['enter foreach', 'p loop=1', 'enter empty-block', 'b loop=0']);
  });

  it('the blocks of the hydration markers, outside the loop', () => {
    const seen: string[] = [];
    walkBlocks(roots(LOOP), (el, _block, inLoop) => {
      if (el.name === 'p' || el.name === 'b') seen.push(`${el.name} ${inLoop}`);
    });
    expect(seen).toEqual(['p true', 'b false']);
  });

  it('the layout directives', () => {
    const source = '@foreach (const x of xs) key (x) { } @empty { @RenderBody() }';
    expect(collectDirectives(parse(source).nodes).renderBody).toHaveLength(1);
  });

  it('the region under the caret', () => {
    const source = LOOP;
    const document = parseDocument(source, { atConstructs }).value;
    expect(regionAt(source, document, source.indexOf('none') + 1).kind).toBe('markup');
    const bare = '@foreach (const x of xs) key (x) { <p>a</p> }';
    expect(regionAt(bare, parseDocument(bare, { atConstructs }).value, bare.indexOf('{')).kind).toBe('markup');
  });

  it('the messages to translate', () => {
    const source = `@code { import { t } from '@fudic/i18n'; }\n${component(LOOP)}`;
    const document = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const js = batchOf(source, document);
    const { messages } = collectMessages({
      source,
      context: 'ctx',
      roots: documentRoots(document),
      astAt: js.astAt,
      scripts: js.scripts,
      imports: i18nImports(js.code),
      mapSpan: js.mapSpan,
    });
    expect(messages.map((m) => m.source)).toEqual(['a', 'none']);
  });
});
