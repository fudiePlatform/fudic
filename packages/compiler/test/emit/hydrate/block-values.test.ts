// @vitest-environment happy-dom
/**
 * SDD-30 §4.5 and §4.6 — the two holes BUG-12 left open for the inside of a loop, run.
 *
 * BUG-12 §3.3.c stated the first one precisely: the node variables of a `@foreach` held the
 * LAST node of the turn, so a write inside the body had no stable reference to be re-applied
 * to and stayed fused with the creation. Its §7 stated the second: a child component
 * fabricated at runtime by a loop had no channel to receive its props on.
 *
 * Both were the same missing thing, and a block is it. What has to be shown is therefore not
 * that the emit mentions `$a` and `$s`, but that a row updates ALONE — the guard in its own
 * `$w`, not the component's — and that a row taken out stops being served.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import type { DomClient } from '@fudic/dom';
import type { Controller } from '@fudic/core';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller } from './_harness.js';

const ROWS =
  '@code {\n' +
  '  const { rows } = props<{ rows: { id: string; n: string }[] }>();\n' +
  '}\n' +
  '<x-rows>\n' +
  '  <template shadowrootmode="open">' +
  '<ul>@foreach (const row of rows) key (row.id) {<li>@row.n</li>}</ul>' +
  '</template>\n' +
  '</x-rows>\n';

/** A parent whose rows each hold a child host fed by the parent's own signal. */
const HOSTS =
  '<link rel="component" href="./x-kid.fud">\n' +
  '@code {\n' +
  '  const { rows } = props<{ rows: string[] }>();\n' +
  '  @client {\n' +
  "    import { signal } from '@fudic/core';\n" +
  '    const tick = signal(0);\n' +
  "    document.addEventListener('tick', () => tick.set(tick() + 1));\n" +
  '  }\n' +
  '}\n' +
  '<x-parent>\n' +
  '  <template shadowrootmode="open">' +
  '<ul>@foreach (const r of rows) key (r) {<li><x-kid .n="@tick" .m="@r"></x-kid></li>}</ul>' +
  '</template>\n' +
  '</x-parent>\n';

const KID =
  '@code {\n  const { n = 0, m = "" } = props<{ n?: number; m?: string }>();\n}\n' +
  '<x-kid>\n  <template shadowrootmode="open"><span>@n @m</span></template>\n</x-kid>\n';

function graphOf(files: Record<string, string>, tag: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud':
        Object.keys(files)
          .map((p) => `<link rel="component" href=".${p}">`)
          .join('\n') + `\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      ...files,
    }),
  );
}

function drive(
  graph: ComponentGraph,
  tag: string,
  dom: DomClient<Node>,
  values: readonly unknown[],
): { ctl: Controller; shadow: ShadowRoot } {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const ctl = controller(clientFactory(graph, tag), dom, shadow, values);
  ctl.c();
  return { ctl, shadow };
}

/** `browserDom` counting the text writes, which is what `$w` is there to prevent. */
function countingText(dom: DomClient<Node>): { dom: DomClient<Node>; written: string[] } {
  const written: string[] = [];
  return {
    dom: {
      ...dom,
      setText: (node: Node, value: string): void => {
        written.push(value);
        dom.setText(node, value);
      },
    },
    written,
  };
}

describe('a write inside a loop, re-applied by the row (§4.5 — BUG-12 §3.3.c)', () => {
  it('updates the row that changed, and writes nothing on the ones that did not', () => {
    const graph = graphOf({ '/x-rows.fud': ROWS }, 'x-rows');
    const traced = countingText(browserDom);
    const rows = [
      { id: 'a', n: '1' },
      { id: 'b', n: '2' },
      { id: 'c', n: '3' },
    ];
    const { ctl, shadow } = drive(graph, 'x-rows', traced.dom, [rows]);
    expect(shadow.innerHTML).toBe('<ul><li>1</li><li>2</li><li>3</li></ul>');

    traced.written.length = 0;
    ctl.u!([, , [{ id: 'a', n: '1' }, { id: 'b', n: '9' }, { id: 'c', n: '3' }]]);

    expect(shadow.innerHTML).toBe('<ul><li>1</li><li>9</li><li>3</li></ul>');
    // Every row re-applies, but each compares against ITS OWN `$w`: only the one whose
    // value moved reaches the DOM. A single `$w` for the component could not tell them
    // apart — which is why the guard lives in the block.
    expect(traced.written).toEqual(['9']);
  });
});

/**
 * A stand-in for the child's own factory. The parent's `s()` calls `u` on the host ELEMENT,
 * so anything with that method serves: what is under test is the channel, not the child.
 *
 * Every call is recorded with the element it landed on, because a `@client` that listens on
 * `document` outlives its instance — the parents of the earlier tests are still subscribed,
 * and only the element says which shadow root a payload belongs to.
 */
const served: { el: Element; n: unknown; m: unknown }[] = [];
customElements.define(
  'x-kid',
  class extends HTMLElement {
    u(payload: unknown[]): void {
      served.push({ el: this, n: payload[2], m: payload[3] });
    }
  },
);

const servedIn = (shadow: ShadowRoot): unknown[] =>
  served.filter((c) => shadow.contains(c.el)).map((c) => c.n);

const rowsServedIn = (shadow: ShadowRoot): unknown[] =>
  served.filter((c) => shadow.contains(c.el)).map((c) => c.m);

describe('a child fabricated by a loop (§4.6 — BUG-12 §7)', () => {
  const graph = graphOf({ '/x-parent.fud': HOSTS, '/x-kid.fud': KID }, 'x-parent');

  it('serves every row its own initial pass, and renews them all on a notification', () => {
    served.length = 0;
    const { shadow } = drive(graph, 'x-parent', browserDom, [['a', 'b']]);
    // One host per row, each hooked up by the `s()` of the block that built it.
    expect(shadow.querySelectorAll('x-kid')).toHaveLength(2);
    expect(servedIn(shadow)).toEqual([0, 0]);

    served.length = 0;
    document.dispatchEvent(new Event('tick'));
    // Two rows alive, two subscriptions, two payloads — not one, and not the last row's.
    expect(servedIn(shadow)).toEqual([1, 1]);
  });

  it('stops serving a row that was retired: its disposer ran with it', () => {
    const { ctl, shadow } = drive(graph, 'x-parent', browserDom, [['a', 'b']]);
    expect(shadow.querySelectorAll('x-kid')).toHaveLength(2);

    // `b` leaves: `r()` of its row empties `$d`, and the subscription goes with it.
    ctl.u!([, , ['a']]);
    expect(shadow.querySelectorAll('x-kid')).toHaveLength(1);

    served.length = 0;
    document.dispatchEvent(new Event('tick'));
    // One payload, not two. A subscription that outlived its row would keep writing into
    // a host the DOM no longer holds — a listener leak wearing the shape of an update.
    expect(servedIn(shadow)).toHaveLength(1);
  });

  it('§6.11 — each row carries ITS OWN value out of the loop, not the last one', () => {
    // The criterion the SDD was written for. Its literal form is a `@click` per row, and
    // event bindings are the tanda after this one (§7) — but the defect is not about
    // events: it is about what a closure created inside the loop captured. The props
    // channel is the same closure, and it is emitted today.
    //
    // Flattened in line, `$n1`…`$n5` were the component's variables reassigned every turn,
    // so after the loop only the LAST row survived. Here every row is served its own.
    const { shadow } = drive(graph, 'x-parent', browserDom, [['a', 'b', 'c']]);

    served.length = 0;
    document.dispatchEvent(new Event('tick'));
    expect(rowsServedIn(shadow)).toEqual(['a', 'b', 'c']);
  });

  it('§6.12 — r() of the component retires every row, not just the last', () => {
    const { ctl, shadow } = drive(graph, 'x-parent', browserDom, [['a', 'b', 'c']]);
    expect(shadow.querySelectorAll('li')).toHaveLength(3);
    // Held by hand: after the teardown these are out of the tree, so `shadow.contains`
    // could no longer find them — and "nobody answers" has to be asked of THEM.
    const kids = [...shadow.querySelectorAll('x-kid')];

    served.length = 0;
    ctl.r!();
    // The N rows are out of the tree — a block's `r()` removes its own nodes, because a
    // block is not a custom element and nobody else will.
    expect(shadow.querySelectorAll('li')).toHaveLength(0);

    // And the N disposers ran, not one: none of the three answers a notification any more.
    // Nulling one variable per node — what the flattened emit did — released a single row.
    document.dispatchEvent(new Event('tick'));
    expect(served.filter((c) => kids.includes(c.el))).toEqual([]);
  });
});
