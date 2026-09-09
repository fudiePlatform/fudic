/**
 * The container tree, built LEXICALLY while the server renders (SDD-38 §4.2).
 *
 * A component that declares a provider owns a container; every other component forwards the
 * one it received. The server is the only side that can number those containers, because it
 * is the only side that visits every instance — an owning ancestor may be N1 and never run a
 * line in the browser — so the numbering happens here, as the render walks, and travels to
 * the client as a published map.
 *
 * Nothing in this file reads the DOM, and that is the invariant rather than an accident: the
 * hierarchy is emitted code, never `getRootNode` or `closest`.
 *
 * An `IocNode` IS a container — `provideIn` and `injectFrom` take it unchanged — with two
 * server-only additions bolted onto the same object, so identity is preserved and the parent
 * chain the injector walks is the real one. `@fudic/di` keeps its containers method-free;
 * this side never reaches a browser, so a method here costs no bundle.
 */

import {
  createChild,
  createRoot,
  injectFrom,
  type Container,
  type InjectOptions,
  type Provider,
} from '@fudic/di';
import { openSeed } from './seed.js';

/** The published map: parent index per node, and the tag that owns each node. */
export type IocMap = readonly [parents: readonly number[], tags: readonly string[]];

export interface IocNode extends Container {
  /** This node's index in the published map. The root is always `0`. */
  readonly index: number;
  /** A child container for the component `tag`, numbered and recorded in the same step. */
  child(tag: string): IocNode;
  /** The map as it stands. Only the root is ever asked. */
  map(): IocMap;
}

interface Collector {
  readonly parents: number[];
  readonly tags: string[];
}

/**
 * The root container of a route — one request on the server, one page in the browser — with
 * the collector the whole tree records itself into.
 */
export function iocRoot(seed?: Readonly<Record<string, unknown>>): IocNode {
  // With no seed given it opens the response's published table — the LIVE object, not a copy.
  // `publish` writes into it during `load`, and the render injects out of it afterwards, so
  // the service the server builds starts from the same value the browser's will.
  return node(createRoot(seed ?? openSeed()), 0, { parents: [-1], tags: [''] });
}

/** Whether anything below the root ever declared a provider. */
export function iocIsEmpty(map: IocMap): boolean {
  return map[0].length <= 1;
}

function node(container: Container, index: number, collector: Collector): IocNode {
  // Bolted onto the very object `createChild` produced, and not onto a copy: the injector
  // walks `parent` by reference, and a copy would climb a chain nobody registered into.
  const self = container as Container & { -readonly [K in keyof IocNode]: IocNode[K] };
  self.index = index;
  self.child = (tag: string): IocNode => {
    collector.parents.push(index);
    collector.tags.push(tag);
    return node(createChild(self, tag), collector.parents.length - 1, collector);
  };
  self.map = (): IocMap => [collector.parents, collector.tags];
  return self;
}

/**
 * `ctx`, with the request's container hung off it as `ctx.inject` (SDD-38 §4.7).
 *
 * `load(ctx)` is the only `async` function of the system — the whole render is a synchronous
 * walk inside a generator — and that is why it resolves through `ctx` rather than through an
 * ambient container. An ambient one here would not be a visible error: it would be silent
 * contamination between concurrent requests in dev and in prerender, and there is no
 * `AsyncLocalStorage` in a Service Worker to paper over one end of it.
 */
export interface DiContext {
  inject<T>(provider: Provider<T>): T;
  inject<T>(provider: Provider<T>, options: InjectOptions): T | undefined;
}

export function withDi<C extends object>(ctx: C, container: Container): C & DiContext {
  const inject = (<T>(provider: Provider<T>, options?: InjectOptions): T | undefined =>
    options === undefined
      ? injectFrom(container, provider)
      : injectFrom(container, provider, options)) as DiContext['inject'];
  return { ...ctx, inject };
}
