// @vitest-environment happy-dom
/**
 * The hookup, driven over a real DOM (SDD-15 §6.13, §6.15–§6.19, and §6.7 with `s()` doing
 * work at last).
 *
 * What the emitted TEXT says is locked by the goldens and by `client.test.ts`; what it DOES
 * is only visible by dispatching real events at the tree the factory holds. That is the
 * whole point of this file: `$event` is the native event or it is not, the arguments arrive
 * in the order they were written or they do not, and a listener registered inside a
 * `@foreach` belongs to its row or it belongs to the last one.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
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

/** An instance the client FABRICATED: `c()` over a fresh shadow root. */
function created(tag: string, component: string, values: readonly unknown[] = []) {
  const g = graphOf(tag, component);
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const c = controller(clientFactory(g, tag), browserDom, shadow, values);
  c.c();
  return { host, shadow, controller: c };
}

/** An instance the client ADOPTED: the server's markup, parsed, then `h()`. */
function hydrated(tag: string, component: string, props: unknown, values: readonly unknown[]) {
  const g = graphOf(tag, component);
  const { host, shadow } = mountAsDsd(tag, serverShadowHtml(g, tag, props));
  const c = controller(clientFactory(g, tag), browserDom, shadow, values);
  c.h();
  return { host, shadow, controller: c };
}

/** What the handlers of the test components record, per instance. */
const log = (): unknown[][] => (globalThis as unknown as { __fudLog: unknown[][] }).__fudLog;

const click = (shadow: ShadowRoot, selector: string): Event => {
  const ev = new Event('click', { cancelable: true });
  shadow.querySelector(selector)!.dispatchEvent(ev);
  return ev;
};

/** The four shapes of §4.5 on every row of a `@foreach`, with FLAT handlers throughout. */
const CASES = (tag: string): string =>
  '@code {\n' +
  '  const { rows = [] } = props<{ rows?: { id: string }[] }>();\n' +
  '  @client {\n' +
  '    globalThis.__fudLog = [];\n' +
  '    function del(...args) { globalThis.__fudLog.push(args); }\n' +
  '  }\n}\n' +
  `<${tag}>\n  <template shadowrootmode="open"><ul>\n` +
  '    @foreach (const row of rows) key (row.id) {\n' +
  `      <li class="r-@row.id">\n` +
  '        <button class="none" @click="@del()">-</button>\n' +
  '        <button class="event" @click="@del($event)">e</button>\n' +
  '        <button class="data" @click="@del(row.id)">d</button>\n' +
  '        <button class="both" @click="@del($event, row.id)">ed</button>\n' +
  '        <button class="reversed" @click="@del(row.id, $event)">de</button>\n' +
  '      </li>\n' +
  '    }\n' +
  '  </ul></template>\n' +
  `</${tag}>\n`;

const ROWS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('the four shapes, dispatched for real (§6.15, §6.16, §6.18, §6.19)', () => {
  let shadow: ShadowRoot;

  beforeEach(() => {
    shadow = created('x-cases', CASES('x-cases'), [ROWS]).shadow;
  });

  it('does not invoke anything at SUBSCRIBE time (§6.19)', () => {
    // The criterion that separates this rule from the retired *factory* form, which did
    // exactly the opposite: it called at hookup and subscribed the return value.
    expect(log()).toEqual([]);
    click(shadow, '.r-a .none');
    expect(log()).toHaveLength(1);
  });

  it('gives the handler the arguments written, and nothing else (§6.16)', () => {
    const nothing = click(shadow, '.r-a .none');
    const evented = click(shadow, '.r-a .event');
    const data = click(shadow, '.r-a .data');
    const both = click(shadow, '.r-a .both');
    // Four shapes, one flat handler: nobody curries, and nobody receives an argument the
    // template did not write.
    expect(log()).toEqual([[], [evented], ['a'], [both, 'a']]);
    expect(nothing).toBeInstanceOf(Event);
  });

  it('`$event` IS the native event (§6.15)', () => {
    const ev = click(shadow, '.r-b .event');
    const [received] = log()[0] as [Event];
    // Identity is the whole criterion: nothing wraps the event and nothing re-creates it,
    // so `type`, `isTrusted` and the rest are the DOM's own and cannot disagree.
    expect(received).toBe(ev);
    expect(received.type).toBe('click');
    expect(received.isTrusted).toBe(ev.isTrusted);
    received.preventDefault();
    expect(ev.defaultPrevented).toBe(true);
  });

  it('keeps the order of the arguments as written (§6.18)', () => {
    // `@del(row.id, $event)` arrives as `(id, ev)`. No implicit reordering: there is no
    // convention to memorise because the emit copies the list as it stands.
    const ev = click(shadow, '.r-c .reversed');
    expect(log()).toEqual([['c', ev]]);
  });

  it('each row handler carries its OWN row, dispatched out of order (§6.17)', () => {
    click(shadow, '.r-c .data');
    click(shadow, '.r-a .data');
    click(shadow, '.r-b .data');
    // The listener lives in the `s()` of its block instance, so the row variable is the
    // one that block was built with — not whatever the loop left behind.
    expect(log()).toEqual([['c'], ['a'], ['b']]);
  });
});

describe('create and hydrate converge on the same listener (§6.7)', () => {
  it('the tree `h()` adopts responds exactly like the one `c()` built', () => {
    const built = created('x-conv', CASES('x-conv'), [ROWS]).shadow;
    click(built, '.r-b .both');
    const fromCreate = log();

    const adopted = hydrated('x-conv', CASES('x-conv'), { rows: ROWS }, [ROWS]).shadow;
    click(adopted, '.r-b .both');
    const fromHydrate = log();

    // Same shape, same row, same argument order: the two paths differ only in how they got
    // their node references, which is what `$s()` living once is for.
    expect(fromHydrate).toHaveLength(1);
    expect(fromHydrate[0]![1]).toBe('b');
    expect(fromCreate[0]![1]).toBe('b');
  });
});

const BUS = (tag: string): string =>
  '@code {\n  @client {\n' +
  '    globalThis.__fudLog = [];\n' +
  '    function onCarrito(ev) { globalThis.__fudLog.push([this.tagName, ev.type]); }\n' +
  '    function press(ev) { globalThis.__fudLog.push(["click"]); }\n' +
  '  }\n}\n' +
  `<${tag}>\n  <template shadowrootmode="open">` +
  `<button bus:carrito="@onCarrito($event)" @click="@press($event)">x</button>` +
  `</template>\n</${tag}>\n`;

describe('teardown cuts every listener (§6.13)', () => {
  it('after r() the node does not respond and the bus stops receiving', () => {
    const { shadow, controller: c } = created('x-tear', BUS('x-tear'));

    click(shadow, 'button');
    document.dispatchEvent(new Event('carrito'));
    // The handler's context is the HOST, so it reaches the signals of its own instance.
    expect(log()).toEqual([['click'], ['X-TEAR', 'carrito']]);

    c.r();
    click(shadow, 'button');
    document.dispatchEvent(new Event('carrito'));
    // The bus one is the one that matters: it lives on `document` and outlives the host,
    // so a subscription with no unsubscription is a leak, not a stale listener.
    expect(log()).toEqual([['click'], ['X-TEAR', 'carrito']]);
  });
});
