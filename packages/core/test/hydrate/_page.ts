/**
 * Building the page the runtime reads, by hand.
 *
 * `innerHTML` does not materialize a declarative shadow root — not in happy-dom and not in a
 * browser — so every shadow here is opened with `attachShadow`, which leaves exactly the tree
 * the parser would have left. What matters to the runtime is the SHAPE (a host carrying
 * `data-fud-id`, an open shadow under it), never how it got there.
 */

import { type TagMap } from '../../src/hydrate/maps.js';
import { allInstances, type ElementRegistry } from '../../src/hydrate/registry.js';

export interface PagePayload {
  readonly state?: readonly [readonly number[], readonly unknown[]];
  readonly tree?: TagMap;
  readonly bus?: TagMap;
}

function block(id: string, value: unknown): void {
  const el = document.createElement('script');
  el.setAttribute('type', 'application/json');
  el.id = id;
  el.textContent = JSON.stringify(value);
  document.body.appendChild(el);
}

/** Reset the document and publish the blocks the page would carry. */
export function publish(payload: PagePayload = {}): void {
  document.body.innerHTML = '';
  if (payload.state !== undefined) block('fud-state', payload.state);
  if (payload.tree !== undefined) block('fud-tree', payload.tree);
  if (payload.bus !== undefined) block('fud-bus', payload.bus);
}

/** A hydratable host with an open shadow root, appended to `parent`. */
export function host(tag: string, id: number, parent: ParentNode = document.body): Element {
  const el = document.createElement(tag);
  el.setAttribute('data-fud-id', String(id));
  parent.appendChild(el);
  el.attachShadow({ mode: 'open' });
  return el;
}

/** What every fake chunk defines: an element that records the slice it was handed. */
export interface Recorder extends HTMLElement {
  slice?: readonly unknown[];
}

/**
 * A faithful custom-element registry, and the reason it exists.
 *
 * The one platform rule the whole cascade is built on is that `define` upgrades every
 * instance of a tag ALREADY IN THE TREE, in place, keeping each instance's shadow root.
 * happy-dom does not model it: it REPLACES the node and drops the shadow root, which would
 * make every test here measure the emulation instead of the runtime. So the registry is a
 * port (SDD-17 §4.4) and this is the model — the same shape the real one has, with `define`
 * doing what the platform does. That the platform really does it is what the Playwright
 * suite of §6 proves, in a real browser.
 *
 * An upgrade here is a prototype swap and no constructor call: what the runtime needs from
 * an upgraded instance is its `h`, and a component's constructor does nothing (SDD-15 §3.7).
 */
export class TestRegistry implements ElementRegistry {
  readonly #ctors = new Map<string, CustomElementConstructor>();
  readonly #waiting = new Map<string, () => void>();

  define(name: string, ctor: CustomElementConstructor): void {
    this.#ctors.set(name, ctor);
    for (const el of allInstances(document)) {
      if (el.localName === name) this.upgrade(el);
    }
    this.#waiting.get(name)?.();
    this.#waiting.delete(name);
  }

  get(name: string): CustomElementConstructor | undefined {
    return this.#ctors.get(name);
  }

  whenDefined(name: string): Promise<unknown> {
    if (this.#ctors.has(name)) return Promise.resolve();
    return new Promise((resolve) => {
      this.#waiting.set(name, () => resolve(undefined));
    });
  }

  upgrade(node: Node): void {
    const ctor = this.#ctors.get((node as Element).localName);
    if (ctor !== undefined) Object.setPrototypeOf(node, ctor.prototype);
  }
}

/**
 * Define `tag` the way an emitted chunk does — a `define` with a side effect — recording the
 * order the definitions happened in and the slice each instance received.
 */
export function defineRecorder(registry: TestRegistry, tag: string, trace: string[]): void {
  trace.push(`define:${tag}`);
  registry.define(
    tag,
    class extends HTMLElement {
      h(props: readonly unknown[]): void {
        (this as Recorder).slice = props;
        trace.push(`h:${tag}#${this.getAttribute('data-fud-id')}`);
      }
    },
  );
}
