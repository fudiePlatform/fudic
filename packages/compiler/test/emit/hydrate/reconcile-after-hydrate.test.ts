// @vitest-environment happy-dom
/**
 * The reconciliation of a construct that came alive by HYDRATING, not by being created.
 *
 * `reconcile.test.ts` drives `u` after `c`, and says so in its own header: "`c` first, not
 * `h`: hydration equivalence is its own suite". The equivalence suites, in turn, compare the
 * FIRST paint and stop there. Between the two lay the case nothing covered — hydrate, then
 * re-render — and a defect lived in it that broke every `@if` and `@switch` in a served page.
 *
 * **What it was.** A block adopts its own nodes by walking back from the level's cursor, and
 * a trailing static run has no element after it, so it is reached as `$dom.lastChild($parent)`
 * and pushed into the block's `$r`. The level reaches the run that FOLLOWS the construct the
 * same way, and hands it to the block emitter as the insertion anchor. On the create path
 * those are two nodes, each fabricated by its own side. On the hydrate path they are ONE:
 * text adjacent to text survives a round trip through HTML as a single node.
 *
 * So retiring a block removed the node the next insertion anchors on, and `ChildNode.before()`
 * on a node with no parent does nothing and throws nothing. The old branch left, the new one
 * never arrived, and the console stayed clean.
 *
 * It reached the three families differently, and all three are pinned below:
 *
 *  - `@if` / `@switch` — every change of branch retires the live block, so the first one broke.
 *  - `@foreach` / `@for` — survived while a row held the anchor, and died the moment a list
 *    reached zero and the last row took it away.
 *
 * The fix is ownership: a block adopts a trailing STATIC run as a reference and does not put
 * it in `$r`. It costs one blank text node left behind on teardown; formatting whitespace is
 * not something anybody can see, and an anchor pulled out from under the next insertion is.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import type { Controller } from '@fudic/core';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

/**
 * The whitespace is the fixture, and so is the `display: grid`.
 *
 * The collision needs the block's trailing run and the level's next run to survive as NODES.
 * In a plain block container `emitItems` proves that formatting whitespace between two
 * block-level children renders nothing and prunes it (BUG-21) — with nothing there the level
 * anchors on `null`, appends, and no defect is reachable. In a grid, which is what the panel
 * that first showed this bug uses, both runs are kept, they serialize adjacent, and the
 * parser hands ONE node back for the two. A first draft of this file used a plain `<div>`
 * and passed against the broken emit.
 */
const STYLE = (rule: string): string => `<head>\n  <style>\n    ${rule}\n  </style>\n</head>\n`;

const BRANCH =
  '@code {\n  const { n } = props<{ n: number }>();\n}\n' +
  STYLE('.caso { display: grid; }') +
  '<x-br>\n  <template shadowrootmode="open">' +
  '<div class="caso">\n      <p class="que">if</p>\n      @if (n > 1) {\n' +
  '        <p class="salida">muchos</p>\n      } else {\n' +
  '        <p class="salida">uno</p>\n      }\n    </div>' +
  '</template>\n</x-br>\n';

/** The same collision with no stylesheet at all: an inline level keeps every run. */
const INLINE =
  '@code {\n  const { n } = props<{ n: number }>();\n}\n' +
  '<x-in>\n  <template shadowrootmode="open">' +
  '<span class="caso">a @if (n > 1) { <b class="salida">muchos</b> }' +
  ' else { <b class="salida">uno</b> } b</span>' +
  '</template>\n</x-in>\n';

const SWITCH =
  '@code {\n  const { n } = props<{ n: number }>();\n}\n' +
  STYLE('.caso { display: grid; }') +
  '<x-sw>\n  <template shadowrootmode="open">' +
  '<div class="caso">\n      <p class="que">sw</p>\n      @switch (n) {\n        case 0:\n' +
  '          <p class="salida">cero</p>\n        default:\n' +
  '          <p class="salida">otros</p>\n      }\n    </div>' +
  '</template>\n</x-sw>\n';

const LIST =
  '@code {\n  const { rows } = props<{ rows: string[] }>();\n}\n' +
  STYLE('.lista { display: grid; }') +
  '<x-li>\n  <template shadowrootmode="open">' +
  '<ul class="lista">\n      <li class="cab">filas</li>\n' +
  '      @foreach (const r of rows) key (r) {\n        <li class="fila">@r</li>\n      }\n    </ul>' +
  '</template>\n</x-li>\n';

function graphOf(tag: string, source: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud':
        `<link rel="component" href="./${tag}.fud">\n` +
        `<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: source,
    }),
  );
}

/**
 * Render on the server, mount the way the parser leaves it, and hydrate. What comes back is
 * the controller and the live shadow root — the state a served page is in before the first
 * `set`, which is the state the defect needed.
 */
function hydrated(
  graph: ComponentGraph,
  tag: string,
  props: object,
  values: readonly unknown[],
): { ctl: Controller; shadow: ShadowRoot } {
  // Two shapes for the same state, because the two sides take it differently: the server
  // render is handed the props OBJECT, the client factory the positional slice its payload
  // carries. Feeding the server the client's shape is how the first draft of this file made
  // every `n` undefined and still looked green.
  const { shadow } = mountAsDsd(tag, serverShadowHtml(graph, tag, props));
  const ctl = controller(clientFactory(graph, tag), browserDom, shadow, values);
  ctl.h!();
  return { ctl, shadow };
}

const salidas = (shadow: ShadowRoot): string[] =>
  [...shadow.querySelectorAll('.salida')].map((el) => el.textContent!.trim());

describe('@if reconciled after hydrating', () => {
  const graph = graphOf('x-br', BRANCH);

  it('swaps the branch, and leaves exactly one behind', () => {
    const { ctl, shadow } = hydrated(graph, 'x-br', { n: 1 }, [1]);
    expect(salidas(shadow)).toEqual(['uno']);

    ctl.u!([, , 2]);
    // One, not zero. Zero is what the defect produced: the old branch retired, the new one
    // inserted before an anchor that had just left the tree, and nothing to see.
    expect(salidas(shadow)).toEqual(['muchos']);

    ctl.u!([, , 1]);
    expect(salidas(shadow)).toEqual(['uno']);
  });

  it('survives many changes: every retirement is a chance to lose the anchor', () => {
    const { ctl, shadow } = hydrated(graph, 'x-br', { n: 1 }, [1]);
    for (const n of [2, 1, 2, 1, 5]) ctl.u!([, , n]);
    expect(salidas(shadow)).toEqual(['muchos']);
  });

  it('puts the new branch back where the old one was, not at the end', () => {
    // The anchor is not decoration: the block's nodes are the PARENT's children, so what
    // says where they go is the node that follows the construct in its level.
    const { ctl, shadow } = hydrated(graph, 'x-br', { n: 1 }, [1]);
    ctl.u!([, , 2]);
    const clases = [...shadow.querySelector('.caso')!.children].map((el) => el.className);
    expect(clases).toEqual(['que', 'salida']);
  });
});

describe('@if in an inline level, where every run is kept and no stylesheet is needed', () => {
  it('swaps the branch without disturbing the text around it', () => {
    const graph = graphOf('x-in', INLINE);
    const { ctl, shadow } = hydrated(graph, 'x-in', { n: 1 }, [1]);
    expect(salidas(shadow)).toEqual(['uno']);

    ctl.u!([, , 2]);
    expect(salidas(shadow)).toEqual(['muchos']);
    // The prose on either side is the level's, not the block's, and it stays put: the
    // whitespace the block used to take with it is exactly what holds this sentence apart.
    expect(shadow.querySelector('.caso')!.textContent!.replace(/\s+/gu, ' ').trim()).toBe(
      'a muchos b',
    );
  });
});

describe('@switch reconciled after hydrating', () => {
  it('swaps the case and keeps one arm alive', () => {
    const graph = graphOf('x-sw', SWITCH);
    const { ctl, shadow } = hydrated(graph, 'x-sw', { n: 0 }, [0]);
    expect(salidas(shadow)).toEqual(['cero']);

    ctl.u!([, , 7]);
    expect(salidas(shadow)).toEqual(['otros']);
  });
});

describe('@foreach reconciled after hydrating', () => {
  const graph = graphOf('x-li', LIST);
  const filas = (shadow: ShadowRoot): string[] =>
    [...shadow.querySelectorAll('li.fila')].map((el) => el.textContent!.trim());

  it('grows and shrinks while a row is left to hold the anchor', () => {
    const { ctl, shadow } = hydrated(graph, 'x-li', { rows: ['a', 'b'] }, [['a', 'b']]);
    expect(filas(shadow)).toEqual(['a', 'b']);

    ctl.u!([, , ['a', 'b', 'c']]);
    expect(filas(shadow)).toEqual(['a', 'b', 'c']);

    ctl.u!([, , ['a']]);
    expect(filas(shadow)).toEqual(['a']);
  });

  it('REPOPULATES after emptying — the case the last row used to take with it', () => {
    // This is the loop half of the same defect, and the one a user meets as "it worked until
    // I filtered everything out". The last row owned the anchor, so emptying the list left
    // the level with a reference to a node outside the tree and every later insertion was a
    // silent no-op: the list could never come back.
    const { ctl, shadow } = hydrated(graph, 'x-li', { rows: ['a', 'b'] }, [['a', 'b']]);

    ctl.u!([, , []]);
    expect(filas(shadow)).toEqual([]);

    ctl.u!([, , ['x']]);
    expect(filas(shadow)).toEqual(['x']);

    ctl.u!([, , ['x', 'y', 'z']]);
    expect(filas(shadow)).toEqual(['x', 'y', 'z']);
  });

  it('and the rows go back inside the <ul>, not beside it', () => {
    const { ctl, shadow } = hydrated(graph, 'x-li', { rows: ['a'] }, [['a']]);
    ctl.u!([, , []]);
    ctl.u!([, , ['x']]);
    expect(shadow.querySelector('ul')!.querySelectorAll('li.fila')).toHaveLength(1);
  });
});
