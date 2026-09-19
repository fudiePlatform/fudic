/**
 * SDD-29 criterion 15 — a signal handed to a snippet.
 *
 * The claim of §4.2 is that a snippet does not create reactivity and does not raise anybody's
 * level: it cannot declare anything, so whatever reactivity shows up in the expanded markup
 * came from the caller, which already had it. The argument crosses no boundary because the
 * markup lands in the caller's own scope.
 *
 * That is not a claim about a diagnostic, so it is not measured with one. It is measured the
 * only way it can be settled: the module emitted for the call and the module emitted for the
 * same markup written out by hand, compared BYTE FOR BYTE. Level inference, the client chunk,
 * the cells, the reactive plan — everything downstream is a function of that text, so if the
 * two texts are equal there is nothing left for a snippet to have changed.
 */

import { describe, expect, it } from 'vitest';
import { emitComponentModule, resolveComponents } from '../../src/emit/index.js';
import { memoryIo } from '../emit/_support.js';

/** The caller's own reactive state: one signal, declared in its `@client`. */
const CODE = `@code {
  @client {
    import { signal } from '@fudic/core';

    const tick = signal(0);
  }
}
`;

const page = (body: string): string =>
  `<app-page><template shadowrootmode="open">${body}</template></app-page>`;

/** The module a component entry emits, with its graph resolved. */
function moduleOf(source: string): string {
  const graph = resolveComponents('/app-page.fud', memoryIo({ '/app-page.fud': source }));
  const entry = graph.entry;
  if (entry.type !== 'component-document') throw new Error(`role: ${entry.type}`);
  return emitComponentModule(graph, {
    tag: entry.name,
    path: '/app-page.fud',
    source: graph.entrySource,
    doc: entry,
    deps: graph.entryDeps,
  });
}

describe('a signal passed to a @render', () => {
  const BODY = '<b class="count">@value</b>';

  const called = `${CODE}@snippet badge(value: number) { ${BODY} }
${page(`<p>@render badge(tick)</p>`)}`;

  // The same markup in the same place. The substitution parenthesizes the argument and the
  // implicit expression becomes explicit, which is the rewrite §4.10 describes: `@value` with
  // `tick` is `@(tick)`, never `@tick` — the two are the same atom, and only one of them
  // stays parseable when the head is an arbitrary expression.
  const byHand = `${CODE}${page(`<p><b class="count">@(tick)</b></p>`)}`;

  it('leaves neither construct in the text the emit reads', () => {
    const graph = resolveComponents('/app-page.fud', memoryIo({ '/app-page.fud': called }));
    expect(graph.entrySource).not.toContain('@render');
    expect(graph.entrySource).not.toContain('@snippet');
  });

  it('emits exactly the module the hand-written markup emits', () => {
    expect(moduleOf(called)).toBe(moduleOf(byHand));
  });

  it('and the module really does carry the reactivity — the comparison is not of two blanks', () => {
    const module = moduleOf(called);
    expect(module).toContain('signal');
    expect(module).toContain('tick');
  });
});
