// @vitest-environment happy-dom
/**
 * The hookup, driven over a real DOM (SDD-15 §6.13, §6.15–§6.20).
 *
 * What the emitted TEXT says is locked by the goldens and by `client.test.ts`; what it
 * DOES is only visible by dispatching real events at the tree the factory holds. That is
 * the whole point of this file: `$event` is the native event or it is not, the arguments
 * arrive in the order they were written or they do not, and a listener registered inside a
 * `@foreach` belongs to its row or it belongs to the last one.
 */

import { describe, expect, it } from 'vitest';
import { browserDom } from '@fudic/dom';
import { resolveComponents, type ComponentGraph } from '../../../src/emit/index.js';
import { memoryIo } from '../_support.js';
import { clientFactory, controller } from './_harness.js';

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

/** A live instance built by `c()`: its host, its shadow root and its controller. */
function live(tag: string, component: string, values: readonly unknown[] = []) {
  const g = graphOf(tag, component);
  const host = document.createElement(tag);
  const shadow = host.attachShadow({ mode: 'open' });
  document.body.append(host);
  const c = controller(clientFactory(g, tag), browserDom, shadow, values);
  c.c();
  return { host, shadow, controller: c };
}

const BUS = (tag: string): string =>
  '@code {\n  @client {\n' +
  '    globalThis.__fudSeen = [];\n' +
  '    function onCarrito(ev) { globalThis.__fudSeen.push(this.tagName + ":" + ev.type); }\n' +
  '    function press(ev) { globalThis.__fudSeen.push("click"); }\n' +
  '  }\n}\n' +
  `<${tag}>\n  <template shadowrootmode="open">` +
  `<button bus:carrito="@onCarrito($event)" @click="@press($event)">x</button>` +
  `</template>\n</${tag}>\n`;

const seen = (): string[] => (globalThis as unknown as { __fudSeen: string[] }).__fudSeen;

describe('teardown cuts every listener (§6.13)', () => {
  it('after r() the node does not respond and the bus stops receiving', () => {
    const { shadow, controller: c } = live('x-tear', BUS('x-tear'));
    const button = shadow.querySelector('button')!;

    button.dispatchEvent(new Event('click'));
    document.dispatchEvent(new Event('carrito'));
    // The handler's context is the HOST, so it reaches the signals of its own instance.
    expect(seen()).toEqual(['click', 'X-TEAR:carrito']);

    c.r();
    button.dispatchEvent(new Event('click'));
    document.dispatchEvent(new Event('carrito'));
    // The bus one is the one that matters: it lives on `document` and outlives the host,
    // so a subscription with no unsubscription is a leak, not a stale listener.
    expect(seen()).toEqual(['click', 'X-TEAR:carrito']);
  });
});
