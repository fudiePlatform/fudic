// @vitest-environment happy-dom
/**
 * SDD-30 §4.4 and §4.1 — what `u` does to a list, run.
 *
 * The emitted text can show that a reconciliation was written; it cannot show that it
 * reconciles. Whether the same row survives a reorder, whether a key that repeats leaves an
 * instance behind, and whether an `@if` that stays on its branch updates instead of
 * rebuilding are all facts about a Map, a loop and the DOM agreeing at runtime — and each
 * of them looks perfectly reasonable in the source either way.
 *
 * So the component is compiled, its factory driven over a real tree, and `u` called with
 * new data. `c` first, not `h`: hydration equivalence is its own suite.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import type { Controller } from '@fudic/core';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller } from './_harness.js';

const shadowOf = (tag: string, markup: string, code: string): string =>
  `${code}<${tag}>\n  <template shadowrootmode="open">${markup}</template>\n</${tag}>\n`;

const LIST = shadowOf(
  'x-list',
  '<ul>@foreach (const row of rows) key (row.id) {<li>@row.n</li>}</ul>',
  '@code {\n  const { rows } = props<{ rows: { id: string; n: string }[] }>();\n}\n',
);

const NESTED = shadowOf(
  'x-nest',
  '<ul>@foreach (const r of rows) key (r.id) {<li>@foreach (const c of r.cs) key (c) {<b>@c</b>}</li>}</ul>',
  '@code {\n  const { rows } = props<{ rows: { id: string; cs: string[] }[] }>();\n}\n',
);

const BRANCH = shadowOf(
  'x-br',
  '<div>@if (n === 1) {<i>@n</i>} else if (n === 2) {<b>B</b>} else {<u>U</u>}</div>',
  '@code {\n  const { n } = props<{ n: number }>();\n}\n',
);

function graphOf(tag: string, source: string): ComponentGraph {
  const io = memoryIo({
    '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
    [`/${tag}.fud`]: source,
  });
  return resolveComponents('/page.fud', io);
}

/** A live instance of `tag`, created (not hydrated), with its shadow root to look at. */
function drive(
  tag: string,
  source: string,
  values: readonly unknown[],
): { ctl: Controller; shadow: ShadowRoot; html: () => string; u: (v: unknown) => void } {
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const ctl = controller(clientFactory(graphOf(tag, source), tag), browserDom, shadow, values);
  ctl.c();
  // The payload is positional and the two leading holes are the adapter and the root
  // (BUG-12 §3.3): an update carries state, not plumbing.
  return { ctl, shadow, html: () => shadow.innerHTML, u: (v) => ctl.u!([, , v]) };
}

const row = (id: string, n: string): { id: string; n: string } => ({ id, n });

describe('a keyed loop under u (§4.4)', () => {
  it('updates a row, retires the one that left, and builds the one that arrived', () => {
    const list = drive('x-list', LIST, [[row('a', '1'), row('b', '2'), row('c', '3')]]);
    expect(list.html()).toBe('<ul><li>1</li><li>2</li><li>3</li></ul>');

    list.u([row('a', '9'), row('c', '3')]);
    expect(list.html()).toBe('<ul><li>9</li><li>3</li></ul>');

    list.u([row('z', '0'), row('a', '9'), row('c', '3')]);
    expect(list.html()).toBe('<ul><li>0</li><li>9</li><li>3</li></ul>');
  });

  it('moves the rows on a reorder instead of rebuilding them', () => {
    const list = drive('x-list', LIST, [[row('a', '1'), row('b', '2'), row('c', '3')]]);
    const first = list.shadow.querySelectorAll('li')[0]!;
    list.u([row('c', '3'), row('b', '2'), row('a', '1')]);
    expect(list.html()).toBe('<ul><li>3</li><li>2</li><li>1</li></ul>');
    // The SAME node at the far end, not a new one that happens to say the same thing. It is
    // what the key buys, and what an index-based default would throw away.
    expect(list.shadow.querySelectorAll('li')[2]).toBe(first);
  });

  it('empties to nothing and fills again', () => {
    const list = drive('x-list', LIST, [[row('a', '1')]]);
    list.u([]);
    expect(list.html()).toBe('<ul></ul>');
    list.u([row('b', '2')]);
    expect(list.html()).toBe('<ul><li>2</li></ul>');
  });

  it('leaves nothing behind when a key repeats: the first wins, the rest are new rows', () => {
    // Two rows with one key is an author's error the compiler cannot see (§4.4). What it
    // must not become is a leak: the instance that loses the slot in the index has to be
    // retired, or its nodes pile up one per update.
    const list = drive('x-list', LIST, [[row('a', '1'), row('a', '2')]]);
    expect(list.html()).toBe('<ul><li>1</li><li>2</li></ul>');
    list.u([row('a', '1'), row('a', '2')]);
    expect(list.html()).toBe('<ul><li>1</li><li>2</li></ul>');
    list.u([row('a', '1'), row('a', '2')]);
    expect(list.html()).toBe('<ul><li>1</li><li>2</li></ul>');
  });

  it('§6.15 — a row’s own state survives the reorder', () => {
    // What the key actually buys. An `<input>` the user typed into holds state no data
    // knows about; reconciling by index would leave it sitting on the wrong row, and the
    // author would see the text jump between fields for no reason they can name.
    const WITH_INPUT = shadowOf(
      'x-in',
      '<ul>@foreach (const row of rows) key (row.id) {<li><input><span>@row.n</span></li>}</ul>',
      '@code {\n  const { rows } = props<{ rows: { id: string; n: string }[] }>();\n}\n',
    );
    const list = drive('x-in', WITH_INPUT, [[row('a', '1'), row('b', '2'), row('c', '3')]]);
    const typed = list.shadow.querySelectorAll('input')[1]!;
    typed.value = 'escrito a mano';

    list.u([row('c', '3'), row('b', '2'), row('a', '1')]);

    const moved = list.shadow.querySelectorAll('input')[1]!;
    expect(moved).toBe(typed);
    expect(moved.value).toBe('escrito a mano');
    expect(list.shadow.textContent).toBe('321');
  });

  it('reconciles a nested loop per row, from the row’s own u', () => {
    const nest = drive('x-nest', NESTED, [[{ id: 'a', cs: ['1', '2'] }]]);
    expect(nest.html()).toBe('<ul><li><b>1</b><b>2</b></li></ul>');
    nest.u([{ id: 'a', cs: ['2', '3'] }]);
    expect(nest.html()).toBe('<ul><li><b>2</b><b>3</b></li></ul>');
  });
});

describe('an @if under u (§4.1)', () => {
  it('updates the live instance while the branch holds, and swaps it when it changes', () => {
    const br = drive('x-br', BRANCH, [1]);
    expect(br.html()).toBe('<div><i>1</i></div>');

    const live = br.shadow.querySelector('i')!;
    br.u(1);
    expect(br.shadow.querySelector('i')).toBe(live); // same branch → u, not a rebuild

    br.u(2);
    expect(br.html()).toBe('<div><b>B</b></div>');
    br.u(5);
    expect(br.html()).toBe('<div><u>U</u></div>');

    // Back to A builds a NEW instance: the old one was retired when the branch changed.
    br.u(1);
    expect(br.html()).toBe('<div><i>1</i></div>');
    expect(br.shadow.querySelector('i')).not.toBe(live);
  });
});
