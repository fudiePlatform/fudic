// @vitest-environment happy-dom
/**
 * Delegation, dispatched for real (SDD-37 §6.13–§6.17).
 *
 * What the emitted text says is locked by `test/emit/delegation.test.ts` and by the goldens.
 * What it DOES is only visible by clicking: the row hands over its own object or a copy of it,
 * the getter reads the current row or the first one it ever saw, and a click outside every row
 * calls the handler or does not. None of those is answerable from the source of the chunk.
 *
 * The measurement of §6.17 is here too, and it is the reason the SDD exists: retiring N rows
 * has to cost zero `removeEventListener`, and mounting N rows exactly one `event()`.
 */

import { describe, expect, it } from 'vitest';
import { browserDom, type Dom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller, mountAsDsd, serverShadowHtml } from './_harness.js';

/** A one-component graph from an in-memory page that links it. */
function graphOf(tag: string, component: string): ComponentGraph {
  return resolveComponents(
    '/page.fud',
    memoryIo({
      '/page.fud': `<link rel="component" href="./${tag}.fud">\n<html><head></head><body><${tag}></${tag}></body></html>\n`,
      [`/${tag}.fud`]: component,
    }),
  );
}

/** The calendar of §3.1: one handler on the grid, two markers per row. */
const CALENDAR = (tag: string): string =>
  '@code {\n' +
  '  const { days = [] } = props<{ days?: { id: string; n: number }[] }>();\n' +
  '  @client {\n' +
  '    globalThis.__fudLog = [];\n' +
  '    function pick(ev, day) { globalThis.__fudLog.push(day); }\n' +
  '  }\n}\n' +
  `<${tag}>\n  <template shadowrootmode="open">` +
  '<div class="grid" @click="@pick($event, $day)"><h2>Month</h2>\n' +
  '    @foreach (const day of days) key (day.id) {\n' +
  '      <div class="cell c-@day.id"><span>@day.n</span><button class="edit">e</button></div>\n' +
  '    }\n' +
  `  </div></template>\n</${tag}>\n`;

/** The same, with the markers where they belong. */
const MARKED = (tag: string): string =>
  CALENDAR(tag)
    .replace('<div class="cell c-@day.id">', '<div class="cell c-@day.id" delegate:day>')
    .replace('<button class="edit">', '<button class="edit" delegate:day>');

/** What the handler recorded, per dispatch. */
const log = (): unknown[] => (globalThis as unknown as { __fudLog: unknown[] }).__fudLog;

const click = (root: ParentNode, selector: string): Event => {
  const ev = new Event('click', { bubbles: true, composed: true, cancelable: true });
  root.querySelector(selector)!.dispatchEvent(ev);
  return ev;
};

const day = (id: string, n: number): { id: string; n: number } => ({ id, n });

/** A created instance of the marked calendar, and the payload channel `u` takes. */
function calendar(days: readonly unknown[], dom: Dom<Node> = browserDom) {
  const tag = 'x-cal';
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const ctl = controller(clientFactory(graphOf(tag, MARKED(tag)), tag), dom, shadow, [days]);
  ctl.c();
  return { shadow, u: (v: unknown): void => ctl.u!([, , v]), ctl };
}

describe('a marked row hands over its own object (§6.13, §6.14)', () => {
  it('delivers the very object of the row that was clicked — `toBe`, not `toEqual`', () => {
    const rows = [day('a', 1), day('b', 2), day('c', 3)];
    const { shadow } = calendar(rows);

    click(shadow, '.c-b');
    expect(log()).toHaveLength(1);
    // The identity is the whole claim: nothing was serialized, so nothing had to be rebuilt.
    expect(log()[0]).toBe(rows[1]);
  });

  it('delivers the row from a click born on a DESCENDANT of the marker', () => {
    const rows = [day('a', 1), day('b', 2)];
    const { shadow } = calendar(rows);

    click(shadow, '.c-b .edit');
    expect(log()[0]).toBe(rows[1]);
  });

  it('does not invoke the handler for a click outside every row', () => {
    const { shadow } = calendar([day('a', 1)]);
    // The `<h2>` of the grid is under the listener and under no marker: the guard returns
    // before the call, which is the price of `$day` being a `Day` and never `Day | undefined`.
    click(shadow, 'h2');
    expect(log()).toEqual([]);
  });
});

describe('the getter, and not the value (§6.15)', () => {
  it('serves the row `u` brought, not the one the first turn saw', () => {
    const first = [day('a', 1), day('b', 2)];
    const { shadow, u } = calendar(first);
    const second = [day('a', 9), day('b', 8)];

    u(second);
    click(shadow, '.c-a');
    // Same key, same node, NEW object: a `set` of the value would have frozen the first one.
    expect(log()[0]).toBe(second[0]);
    expect(log()[0]).not.toBe(first[0]);
  });

  it('follows a reordering: the cell now in position 0 is the row now in position 0', () => {
    const rows = [day('a', 1), day('b', 2), day('c', 3)];
    const { shadow, u } = calendar(rows);

    u([rows[2], rows[0], rows[1]]);
    click(shadow, '.cell');
    expect(log()[0]).toBe(rows[2]);
  });

  it('does the same on an ADOPTED instance, which never fabricated a row', () => {
    const tag = 'x-cal-h';
    const graph = graphOf(tag, MARKED(tag));
    const rows = [day('a', 1), day('b', 2)];
    const { shadow } = mountAsDsd(tag, serverShadowHtml(graph, tag, { days: rows }));
    const ctl = controller(clientFactory(graph, tag), browserDom, shadow, [rows]);
    ctl.h();

    click(shadow, '.c-b');
    expect(log()[0]).toBe(rows[1]);
  });
});

describe('through the shadow of a child (§6.16)', () => {
  it('a click born inside a child\'s shadow reaches the ancestor with its row', () => {
    const tag = 'x-cards';
    const source =
      '@code {\n' +
      '  const { days = [] } = props<{ days?: { id: string; n: number }[] }>();\n' +
      '  @client {\n' +
      '    globalThis.__fudLog = [];\n' +
      '    function pick(ev, day) { globalThis.__fudLog.push(day); }\n' +
      '  }\n}\n' +
      `<${tag}>\n  <template shadowrootmode="open">` +
      '<div class="grid" @click="@pick($event, $day)">\n' +
      '    @foreach (const day of days) key (day.id) {\n' +
      '      <app-card class="c-@day.id" delegate:day></app-card>\n' +
      '    }\n' +
      `  </div></template>\n</${tag}>\n`;
    const graph = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud':
          `<link rel="component" href="./${tag}.fud">\n<link rel="component" href="./app-card.fud">\n` +
          `<html><head></head><body><${tag}></${tag}></body></html>\n`,
        [`/${tag}.fud`]: source,
        '/app-card.fud': '<app-card>\n  <template shadowrootmode="open"><b>card</b></template>\n</app-card>\n',
      }),
    );
    const rows = [day('a', 1), day('b', 2)];
    const host = document.createElement(tag);
    const shadow = host.attachShadow({ mode: 'open' });
    document.body.append(host);
    controller(clientFactory(graph, tag), browserDom, shadow, [rows]).c();

    // The parent fabricates the child's host and does NOT open its shadow — that is the
    // runtime's call — so the child's own root is opened here, exactly as SDD-17 would.
    const card = shadow.querySelector('.c-b')!;
    const inner = card.attachShadow({ mode: 'open' });
    inner.innerHTML = '<b>card</b>';

    click(inner, 'b');
    // `composedPath()` crosses the boundary and the host is on it: `closest()` could not see
    // out of the child at all, which is §4.2 in one dispatch.
    expect(log()[0]).toBe(rows[1]);
  });
});

describe('what a row costs (§6.17, the reason for the SDD)', () => {
  /** `browserDom` with every `event()` and every teardown of one counted. */
  function counting(): { dom: Dom<Node>; events: number; removals: number } {
    const seen = { dom: browserDom as Dom<Node>, events: 0, removals: 0 };
    seen.dom = {
      ...browserDom,
      event: (node: Node, type: string, cb: (e: Event) => void) => {
        seen.events += 1;
        const off = browserDom.event(node, type, cb);
        return () => {
          seen.removals += 1;
          off();
        };
      },
    } as Dom<Node>;
    return seen;
  }

  it('mounts N rows with ONE listener, and retires them all with none', () => {
    const spy = counting();
    const rows = [day('a', 1), day('b', 2), day('c', 3), day('d', 4)];
    const { u } = calendar(rows, spy.dom);

    // Four rows, eight marked elements, one listener: the number does not depend on N.
    expect(spy.events).toBe(1);
    expect(spy.removals).toBe(0);

    u([rows[0]]);
    // Three rows gone. Their entries left with their nodes — a `WeakMap` has no `delete` to
    // write and the main thread has no `removeEventListener` to run.
    expect(spy.removals).toBe(0);

    u([...rows, day('e', 5)]);
    expect(spy.events).toBe(1);
  });
});
