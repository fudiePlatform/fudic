// Builds by hand the page the runtime reads. `innerHTML` does not materialize a declarative
// shadow root, so shadows are opened with `attachShadow`, which leaves the same tree.

import { browserDom } from '@fudic/dom';
import { createCascade, type Cascade } from '../../src/hydrate/cascade.js';
import { createCells } from '../../src/hydrate/cells.js';
import { createChunkLoader } from '../../src/hydrate/chunks.js';
import { readPageMaps, type PageMaps, type TagMap } from '../../src/hydrate/maps.js';
import { allInstances, instanceState, type InstanceState } from '../../src/hydrate/instances.js';
import { type ElementRegistry } from '../../src/hydrate/registry.js';
import { type ReportHydrated } from '../../src/hydrate/report.js';
import { signal } from '../../src/signal.js';

export interface PagePayload {
  readonly state?: readonly [readonly number[], readonly unknown[]];
  readonly tree?: TagMap;
  readonly bus?: TagMap;
  readonly eager?: readonly string[];
  readonly route?: string;
  readonly data?: unknown;
  /** The `data-fud-id` of the `<body>`, for a route with browser code. */
  readonly bodyId?: number;
}

function block(id: string, value: unknown): void {
  const el = document.createElement('script');
  el.setAttribute('type', 'application/json');
  el.id = id;
  el.textContent = JSON.stringify(value);
  document.body.appendChild(el);
}

/** Resets the document and writes the blocks the page would carry. */
export function publish(payload: PagePayload = {}): void {
  document.body.innerHTML = '';
  document.body.removeAttribute('data-fud-id');
  if (payload.state !== undefined) block('fud-state', payload.state);
  if (payload.tree !== undefined) block('fud-tree', payload.tree);
  if (payload.bus !== undefined) block('fud-bus', payload.bus);
  if (payload.eager !== undefined) block('fud-eager', payload.eager);
  if (payload.route !== undefined) block('fud-route', payload.route);
  if (payload.data !== undefined) block('fud-data', payload.data);
  if (payload.bodyId !== undefined) {
    document.body.setAttribute('data-fud-id', String(payload.bodyId));
  }
}

/** A hydratable host with an open shadow root, appended to `parent`. */
export function host(tag: string, id: number, parent: ParentNode = document.body): Element {
  const el = document.createElement(tag);
  el.setAttribute('data-fud-id', String(id));
  parent.appendChild(el);
  el.attachShadow({ mode: 'open' });
  return el;
}

/** What every fake chunk defines: an element that records the state it was handed. */
export interface Recorder extends HTMLElement {
  slice?: readonly unknown[];
}

/**
 * A registry where `define` upgrades every instance already in the tree, in place, keeping
 * its shadow root, as browsers do. happy-dom replaces the node instead. An upgrade here is a
 * prototype swap with no constructor call.
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

/** Defines `tag` as a chunk does, recording the definition and each `h`. */
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

/** The deferred pieces, without a network. */
export const deferred = async (): Promise<{ dom: typeof browserDom; signal: typeof signal }> => ({
  dom: browserDom,
  signal,
});

/** Lets the runtime's promise chains run out. */
export async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export function click(target: EventTarget): void {
  target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
}

/** The rejections nobody handled while `body` ran, taken from the test runner. */
export async function unhandled(body: () => Promise<void>): Promise<unknown[]> {
  const caught: unknown[] = [];
  const runner = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  const mine = (reason: unknown): void => {
    caught.push(reason);
  };
  process.on('unhandledRejection', mine);
  try {
    await body();
    await settle();
  } finally {
    process.off('unhandledRejection', mine);
    for (const listener of runner) process.on('unhandledRejection', listener);
  }
  return caught;
}

export interface CascadeHarness {
  readonly cascade: Cascade;
  readonly maps: PageMaps;
  readonly state: InstanceState;
  readonly registry: TestRegistry;
  readonly report: ReportHydrated;
  /** Definitions and `h` calls, in order. */
  readonly trace: string[];
  /** `from:tag#id`, in order. */
  readonly reported: string[];
}

/**
 * A cascade over the page as it stands: publish the blocks first. Each downloaded chunk is
 * defined by `define`, a recorder by default.
 */
export function cascadeHarness(
  define: (registry: TestRegistry, tag: string, trace: string[]) => void = defineRecorder,
): CascadeHarness {
  const trace: string[] = [];
  const reported: string[] = [];
  const maps = readPageMaps(document);
  const state = instanceState();
  const registry = new TestRegistry();
  const loader = createChunkLoader({
    registry,
    resolveChunk: (tag) => tag,
    importModule: async (tag) => {
      define(registry, tag, trace);
    },
  });
  const report: ReportHydrated = (id, tag, _ms, from) => {
    reported.push(`${from}:${tag}#${id}`);
  };
  const cascade = createCascade({
    maps,
    cells: createCells(maps, signal),
    loader,
    registry,
    state,
    root: document,
    report,
  });
  return { cascade, maps, state, registry, report, trace, reported };
}
