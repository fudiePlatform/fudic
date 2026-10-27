/**
 * SDD-61 §4.3, criterion 30 — `@empty` in the editor: offered after the `}` of a loop, and
 * coloured as the loop's own word.
 */

import { describe, expect, it } from 'vitest';
import { parseFud } from '@fudic/typecheck';
import type { CachedDocument } from '../../src/document-cache.js';
import { DocumentCache } from '../../src/document-cache.js';
import { semanticTokens } from '../../src/services/semantic-tokens.js';
import { snippetsAt } from '../../src/services/snippets.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { component, LAYOUT, memoryFs } from '../_support.js';

/** A route with `markup` in its body. */
const routeWith = (markup: string): string => `<link rel="layout" href="../layouts/_layout.fud">\n<article>\n${markup}\n</article>\n`;

function cached(source: string): CachedDocument {
  const parsed = parseFud(source);
  return { source, document: parsed.document, html: parsed.html } as CachedDocument;
}

/** Whether `@empty` is offered at the `@` marked with `|`. */
function offered(markup: string): boolean {
  const marked = routeWith(markup);
  const offset = marked.indexOf('|');
  return snippetsAt(cached(marked.replace('|', '')), offset).some((snippet) => snippet.label === '@empty');
}

describe('the `@empty` snippet', () => {
  it.each([
    ['@foreach', '@foreach (const x of xs) key (x) { <i>@x</i> } |@'],
    ['@for', '@for (let i = 0; i < 2; i++) key (i) { <b>@i</b> }\n|@em'],
    ['@while', '@while (go) key (go) { <b>x</b> }|@'],
  ])('is offered right after the `}` of a %s', (_, markup) => {
    expect(offered(markup)).toBe(true);
  });

  it('is not offered where no loop ends', () => {
    expect(offered('<p>x</p> |@')).toBe(false);
    expect(offered('@if (a) { <b>x</b> } |@')).toBe(false);
  });

  it('is not offered with something written between', () => {
    expect(offered('@foreach (const x of xs) key (x) { <i>@x</i> } <p>y</p> |@')).toBe(false);
  });

  it('is not offered to a loop that already has one', () => {
    expect(offered('@foreach (const x of xs) key (x) { <i>@x</i> } @empty { <p>-</p> } |@')).toBe(false);
  });

  it('is not offered before the loop', () => {
    expect(offered('|@ @foreach (const x of xs) key (x) { <i>@x</i> }')).toBe(false);
  });

  it('inserts the block', () => {
    const marked = routeWith('@foreach (const x of xs) key (x) { <i>@x</i> } |@');
    const snippet = snippetsAt(cached(marked.replace('|', '')), marked.indexOf('|')).find((s) => s.label === '@empty');
    expect(snippet?.body).toBe('@empty {\n  $0\n}');
  });
});

describe('the colour of `@empty`', () => {
  it('marks the keyword as a directive, and walks its body', () => {
    const path = '/p/pages/x.fud';
    const source = `<link rel="component" href="../components/app-badge.fud">\n${routeWith(
      '@foreach (const x of xs) key (x) { <i>@x</i> } @empty { <app-badge></app-badge> }',
    )}`;
    const index = new WorkspaceIndex(
      memoryFs({ '/p/layouts/_layout.fud': LAYOUT, '/p/components/app-badge.fud': component('app-badge'), [path]: source }),
    );
    index.scan('/p');
    const tokens = semanticTokens(new DocumentCache(index).get(path, 1, source)).map(
      (token) => [token.type, source.slice(token.span.start, token.span.end)] as const,
    );

    expect(tokens.filter(([type]) => type === 'fudDirective').map(([, text]) => text)).toEqual(['foreach', 'key', 'empty']);
    expect(tokens).toContainEqual(['fudComponentTag', 'app-badge']);
  });
});
