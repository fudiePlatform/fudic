// @vitest-environment happy-dom
/**
 * SDD-30 §6.17 and §6.19 — the server's tree and the client's, with blocks in between.
 *
 * A block is the one construct where the two branches can diverge without either looking
 * wrong: the server decides a condition once and paints the result, the client decides it
 * again and has to land on the very nodes that decision produced. The element cursor is what
 * keeps them in step, and a block that renders nothing has to hand it back untouched.
 *
 * Every case runs `h()` with construction FORBIDDEN (`adoptOnly`): if a single `element`,
 * `text` or `append` fires, the branch is building what the server already painted, and the
 * trees have started to drift.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { adoptOnly, clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

const wrap = (tag: string, code: string, markup: string): string =>
  `${code}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

/** An `@if` and a keyed `@foreach` at the same level, both driven by props. */
const MIXED = wrap(
  'x-mix',
  '@code {\n  const { on, rows } = props<{ on: boolean; rows: string[] }>();\n}\n',
  '<section><h1>t</h1>@if (on) {<b>open</b>}<ul>@foreach (const r of rows) key (r) {<li>@r</li>}</ul></section>',
);

/** The shape §3.4 cannot resolve with an anchor: two interpolated runs, a block between. */
const ANCHORED = wrap(
  'x-anchor',
  '@code {\n  const { a, b, on } = props<{ a: string; b: string; on: boolean }>();\n}\n',
  '<div>@a @if (on) {<b>B</b>} @b</div>',
);

function graphOf(tag: string, source: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
}

/**
 * The three trees for one set of props: what the server painted, what `c()` builds, and
 * what `h()` is left holding after adopting the server's.
 */
function trees(
  graph: ComponentGraph,
  tag: string,
  props: Record<string, unknown>,
  values: readonly unknown[],
): { painted: string; created: string; hydrated: string } {
  const server = mountAsDsd(tag, serverShadowHtml(graph, tag, props));
  const painted = server.shadow.innerHTML; // before anything adopts it

  const fresh = document.createElement(tag);
  const shadow = fresh.attachShadow({ mode: 'open' });
  document.body.append(fresh);
  controller(clientFactory(graph, tag), browserDom, shadow, values).c();

  controller(clientFactory(graph, tag), adoptOnly(browserDom), server.shadow, values).h();
  return { painted, created: shadow.innerHTML, hydrated: server.shadow.innerHTML };
}

describe('create ↔ hydrate with blocks (§6.17)', () => {
  const graph = graphOf('x-mix', MIXED);

  const cases: [string, Record<string, unknown>, readonly unknown[]][] = [
    ['@if closed, no rows', { on: false, rows: [] }, [false, []]],
    ['@if open, no rows', { on: true, rows: [] }, [true, []]],
    ['@if closed, one row', { on: false, rows: ['a'] }, [false, ['a']]],
    ['@if open, one row', { on: true, rows: ['a'] }, [true, ['a']]],
    ['@if open, three rows', { on: true, rows: ['a', 'b', 'c'] }, [true, ['a', 'b', 'c']]],
    ['@if closed, three rows', { on: false, rows: ['a', 'b', 'c'] }, [false, ['a', 'b', 'c']]],
  ];

  for (const [name, props, values] of cases) {
    it(`agrees with ${name}`, () => {
      const t = trees(graph, 'x-mix', props, values);
      expect(t.created).toBe(t.painted);
      expect(t.hydrated).toBe(t.painted);
    });
  }

  it('really did render the branches it claims to', () => {
    // A comparison of two empty strings would pass every case above without proving one.
    expect(trees(graph, 'x-mix', { on: true, rows: ['a', 'b'] }, [true, ['a', 'b']]).painted)
      .toContain('<b>open</b><ul><li>a</li><li>b</li></ul>');
    expect(trees(graph, 'x-mix', { on: false, rows: [] }, [false, []]).painted)
      .toContain('<h1>t</h1><ul></ul>');
  });
});

describe('the anchor §3.4 forces, hydrated (§6.19)', () => {
  const graph = graphOf('x-anchor', ANCHORED);

  it('adopts both runs with the block closed — one text node in the markup, two in the tree', () => {
    // This is the shape the anchor cannot resolve: with the block rendering nothing, the
    // two interpolated runs come back from HTML as a SINGLE text node, and no traversal
    // tells one from the other. The empty comment is the boundary the markup lost.
    const t = trees(graph, 'x-anchor', { a: 'A', b: 'B', on: false }, ['A', 'B', false]);
    expect(t.created).toBe(t.painted);
    expect(t.hydrated).toBe(t.painted);
    expect(t.painted).toContain('<!---->');
  });

  it('adopts both runs with the block open', () => {
    const t = trees(graph, 'x-anchor', { a: 'A', b: 'B', on: true }, ['A', 'B', true]);
    expect(t.created).toBe(t.painted);
    expect(t.hydrated).toBe(t.painted);
    expect(t.painted).toContain('<b>B</b>');
  });

  it('rewrites each run on its own after hydrating, not one over the other', () => {
    // The point of the marker: `$a()` has to find TWO nodes. If the adopt path had landed
    // both variables on the same text node, an update would write one value over the other
    // and the second run would vanish.
    const server = mountAsDsd('x-anchor', serverShadowHtml(graph, 'x-anchor', { a: 'A', b: 'B', on: false }));
    const ctl = controller(clientFactory(graph, 'x-anchor'), browserDom, server.shadow, ['A', 'B', false]);
    ctl.h();
    ctl.u!([, , 'X', 'Y', false]);
    expect(server.shadow.textContent).toContain('X');
    expect(server.shadow.textContent).toContain('Y');
  });
});
