/**
 * `fud-tree` — the composition map (SDD-15 §3.4; criteria §6.25, §6.26).
 *
 * It is tag→[tags] and not instance→[instances], which is the whole reason its weight is
 * irrelevant. What it must get right is WHICH children it lists: the ones of the component's
 * own shadow, never the ones a consumer slots into its light DOM.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { resolveComponents, hydratableTags, type ComponentGraph } from '../../src/emit/index.js';
import { fudTree } from '../../src/emit/maps.js';
import { fixturesDir, fixtureIo, memoryIo, pageModuleOf, ssrIo } from './_support.js';

const treeOf = (graph: ComponentGraph): Record<string, readonly string[]> =>
  fudTree(graph, hydratableTags(graph));

/** A component file with a `@client` body, so it is hydratable in its own right. */
function stateful(tag: string, links: readonly string[], markup: string): string {
  const head = links.map((t) => `<link rel="component" href="./${t}.fud">`).join('\n');
  return `${head}
@code {
  @client {
    import { signal } from '@fudic/core';
    const n = signal(0);
  }
}
<${tag}>
  <template shadowrootmode="open">
${markup}
  </template>
</${tag}>
`;
}

const CHAIN = {
  '/app/home.fud': `<!DOCTYPE html>
<html>
  <head><link rel="component" href="./app-parent.fud"></head>
  <body><app-parent></app-parent></body>
</html>
`,
  '/app/app-parent.fud': stateful('app-parent', ['app-child'], '    <app-child></app-child>'),
  '/app/app-child.fud': stateful('app-child', ['app-grandchild'], '    <app-grandchild></app-grandchild>'),
  '/app/app-grandchild.fud': stateful('app-grandchild', [], '    <p>@(n())</p>'),
};

describe('fud-tree — by tag (§6.25)', () => {
  it('a three-level chain is two entries, and the leaf has none', () => {
    const graph = resolveComponents('/app/home.fud', memoryIo(CHAIN));
    expect(treeOf(graph)).toEqual({
      'app-parent': ['app-child'],
      'app-child': ['app-grandchild'],
    });
  });

  it('200 instances of the child do not change the map', () => {
    // The page instantiates the same chain 200 times. The map is a fact about the
    // CATALOGUE, so it comes out identical — that is what makes its weight irrelevant.
    const many = {
      ...CHAIN,
      '/app/home.fud': `<!DOCTYPE html>
<html>
  <head><link rel="component" href="./app-parent.fud"></head>
  <body>${'<app-parent></app-parent>'.repeat(200)}</body>
</html>
`,
    };
    expect(treeOf(resolveComponents('/app/home.fud', memoryIo(many)))).toEqual(
      treeOf(resolveComponents('/app/home.fud', memoryIo(CHAIN))),
    );
  });

  it('the children are the shadow`s, not the light DOM`s', () => {
    // `x-outer` writes `<x-slotted>` INSIDE `<x-inner>`. Both live in x-outer's shadow —
    // the slotted one is projected, it does not live in x-inner's shadow — so both are
    // children of x-outer and x-inner has no entry at all.
    const graph = resolveComponents(
      '/app/home.fud',
      memoryIo({
        '/app/home.fud': `<!DOCTYPE html>
<html>
  <head><link rel="component" href="./x-outer.fud"></head>
  <body><x-outer></x-outer></body>
</html>
`,
        '/app/x-outer.fud': stateful(
          'x-outer',
          ['x-inner', 'x-slotted'],
          '    <x-inner><x-slotted></x-slotted></x-inner>',
        ),
        '/app/x-inner.fud': stateful('x-inner', [], '    <slot></slot>'),
        '/app/x-slotted.fud': stateful('x-slotted', [], '    <p>@(n())</p>'),
      }),
    );
    expect(treeOf(graph)).toEqual({ 'x-outer': ['x-inner', 'x-slotted'] });
  });

  it('a host inside an @if is a child too', () => {
    const graph = resolveComponents(
      '/app/home.fud',
      memoryIo({
        '/app/home.fud': `<!DOCTYPE html>
<html>
  <head><link rel="component" href="./x-outer.fud"></head>
  <body><x-outer></x-outer></body>
</html>
`,
        '/app/x-outer.fud': stateful(
          'x-outer',
          ['x-inner'],
          '    @if (n()) {\n      <x-inner></x-inner>\n    }',
        ),
        '/app/x-inner.fud': stateful('x-inner', [], '    <p>@(n())</p>'),
      }),
    );
    expect(treeOf(graph)).toEqual({ 'x-outer': ['x-inner'] });
  });
});

describe('fud-tree — only the effective N3 (§6.26)', () => {
  it('the canonical page: app-card holds app-button, and nothing else has an entry', () => {
    const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
    // `app-badge` and `app-list` are not hydratable, so they are neither key nor value —
    // and they are not `app-card`'s children either: the badge is light DOM of the page.
    expect(treeOf(graph)).toEqual({ 'app-card': ['app-button'] });
  });

  it('no id, no entry and no slice — the three of them, on the same render', async () => {
    // They come out of the same pass, so a failure that only broke one of the three would
    // be a failure of coupling. `app-badge` is the case: props and `class:`, nothing else.
    const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);
    const page = await pageModuleOf(graph);
    const { io, dom } = ssrIo();
    const html = [...page({ title: 'x', items: [{ id: 'a', title: 'T', description: 'D', featured: true }] }, io)].join('');
    expect(html).toContain('<app-badge data-fud-adopt="app-badge"'); // it IS rendered…
    expect(html).not.toContain('<app-badge data-fud-id'); // …without identity,
    expect(treeOf(graph)['app-card']).not.toContain('app-badge'); // …absent from the map,
    expect(dom().hydrationState().offsets).toEqual([0, 2, 4]); // …and with no slice of its own.
  });

  it('a non-hydratable child is absent from the map', () => {
    const graph = resolveComponents(
      '/app/home.fud',
      memoryIo({
        '/app/home.fud': `<!DOCTYPE html>
<html>
  <head><link rel="component" href="./x-outer.fud"></head>
  <body><x-outer></x-outer></body>
</html>
`,
        '/app/x-outer.fud': stateful('x-outer', ['x-inert'], '    <x-inert .tone="info"></x-inert>'),
        '/app/x-inert.fud': `@code {
  const { tone = 'neutral' } = props<{ tone?: string }>();
}
<x-inert>
  <template shadowrootmode="open">
    <span>@tone</span>
  </template>
</x-inert>
`,
      }),
    );
    expect(hydratableTags(graph).has('x-inert')).toBe(false);
    expect(treeOf(graph)).toEqual({});
  });
});
