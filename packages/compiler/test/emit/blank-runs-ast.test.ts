/**
 * BUG-21 §6.10, §6.12 and §6.13 — what the rule does NOT touch.
 *
 * Two things had to stay true for the decision to be safe to take at all, and both are the
 * same fact from two sides: the discard is decided over the AST, never over the emitted text.
 *
 *  - **The AST is not pruned.** The `TextNode`s of whitespace are still there with their spans
 *    after emitting, because the formatter, `language-core` and the LSP read them. What was
 *    decided is not to EMIT one, not that it does not exist.
 *  - **The source maps come out right by construction.** A whitespace run anchors nothing —
 *    its value is a bare string, never a `MappedPart` — so no pair can disappear with it, and
 *    the generated offsets are computed over the final layout, so what follows simply moves.
 *    Had this been written as a pass over the generated text, every later mapping would point
 *    a few bytes off, silently. `sourcemap.test.ts` is the test that would catch that, and it
 *    is green without a line changed (§6.11).
 */

import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import {
  resolveComponents,
  emitComponentModule,
  emitComponentClientModule,
  emitComponentModuleMapped,
  type ComponentGraph,
} from '../../src/emit/index.js';
import type { ElementNode, HtmlContent } from '../../src/html/index.js';
import { fixturesDir, fixtureIo, memoryIo } from './_support.js';

const graph: ComponentGraph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

/** Every text node of a subtree, in document order. */
function texts(children: readonly HtmlContent[]): HtmlContent[] {
  return children.flatMap((child) => [
    ...(child.type === 'text' ? [child] : []),
    ...(child.type === 'element' ? texts((child as ElementNode).children) : []),
  ]);
}

describe('§6.10 — the AST is not pruned', () => {
  it('keeps every whitespace TextNode, with its span intact, after both branches emitted', () => {
    const comp = graph.components.get('app-card')!;
    const before = texts(comp.doc.template!.children).length;

    // Both emitters walk the same document; neither may take anything out of it.
    emitComponentModule(graph, comp);
    emitComponentClientModule(graph, comp);

    const after = texts(comp.doc.template!.children);
    expect(after.length).toBe(before);

    const blanks = after.filter((node) => /^[ \t\n\f\r]+$/u.test((node as { value: string }).value));
    // Nine of app-card's runs are the author's indentation, and the emit drops eight of them
    // — from the tree it BUILDS, not from the tree it read.
    expect(blanks.length).toBeGreaterThan(0);
    for (const node of blanks) {
      // The span still tiles the source exactly: it is what the formatter reformats and what
      // the LSP maps a position to.
      expect(comp.source.slice(node.span.start, node.span.end)).toBe((node as { value: string }).value);
    }
  });
});

describe('§6.12 — no mapping goes away with a discarded run', () => {
  const comp = graph.components.get('app-card')!;
  const { mappings } = emitComponentModuleMapped(graph, comp);

  it('anchors exactly the sites the author wrote, and every one of them', () => {
    // The set is stated as the SOURCE offsets of the expressions themselves, found in the
    // `.fud`: a run of whitespace never contributed one — its value is a bare string, not a
    // `MappedPart` — so no site can be missing here because of this BUG. If one ever is, an
    // interpolated run was discarded, which is the failure this criterion exists for.
    const src = comp.source;
    const secondIf = src.indexOf('@if (expanded())', src.indexOf('@if (expanded())') + 1);
    const sites: Record<string, number> = {
      // The interpolation inside <h2> and the two `@if` headers — the second of which lives
      // in the light DOM of `<app-button>`, right where a whitespace run was discarded on
      // one side of it and kept on the other. An attribute binding anchors through
      // `attrs.ts` and is not part of this question.
      '@title': src.indexOf('@title') + '@'.length,
      '@if': src.indexOf('@if (expanded())') + '@if ('.length,
      '@if (light DOM)': secondIf + '@if ('.length,
    };
    const offsets = new Set(mappings.map((m) => m.sourceOffset));
    const missing = Object.keys(sites).filter((name) => !offsets.has(sites[name]!));
    expect(missing).toEqual([]);
  });
});

describe('§6.13 — an interpolated run beside a discarded one keeps its anchor', () => {
  const graph2: ComponentGraph = resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud':
        '<link rel="component" href="./x-anchor.fud">\n' +
        '<html><head></head><body><x-anchor></x-anchor></body></html>\n',
      '/x-anchor.fud': `@code {
  const { title } = props<{ title: string }>();
}

<head>
  <style>:host { display: block; }</style>
</head>

<x-anchor>
  <template shadowrootmode="open">
    <div>
      <p>x</p>
      @title
    </div>
  </template>
</x-anchor>
`,
    }),
  );

  it('still points at the `title` of the .fud after the runs around it went', () => {
    const comp = graph2.components.get('x-anchor')!;
    const { code, mappings } = emitComponentModuleMapped(graph2, comp);
    // The two borders of the shadow root and the run that opens the `<div>` are gone.
    expect(code).not.toContain('$dom.text(" ")');

    // The run carries a hole among its characters, so it goes out as a template literal.
    const gen = code.indexOf('${(') + '${('.length;
    const src = mappings.find((m) => m.generatedOffset === gen)?.sourceOffset;
    expect(src).toBeDefined();
    // Located with `indexOf` over the FINAL text, so this passes if — and only if — the pairs
    // were recomputed over the new layout. A pass over the emitted text would leave them
    // pointing at where the discarded lines used to be.
    expect(comp.source.slice(src!, src! + 'title'.length)).toBe('title');
    expect(comp.source[src! - 1]).toBe('@');
  });
});
