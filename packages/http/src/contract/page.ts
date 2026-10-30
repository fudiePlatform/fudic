/**
 * `load`, `paths` and `layout` of a route's `.fudapi` (SDD-60 §3.4): pieces only the server
 * implements, `load.handle(fn)` and its siblings, never called from the browser.
 */

import { DATA_FRAMES_TYPE, DATA_PREFIX } from '@fudic/conventions';
import { Slot } from '@fudic/forms/contract';
import type { ServerContext } from '../types.js';
import type { Level } from './middleware.js';
import type { Ty } from '../wire/ty.js';
import type { DataTypes, FramedData } from '../wire/frames.js';

export interface PageSpec {
  readonly id: string;
  /** `load`, `paths` or `layout`. */
  readonly name: string;
  /** `load`: global, file and its own level. */
  readonly chain?: readonly Level[];
  /** The browser variant: no implementation is possible here. */
  readonly browser?: boolean;
  /** `load`: its fields marked `later`, which the handler returns as promises (SDD-70). */
  readonly later?: readonly string[];
  /** `load`: the type of every field, a `later` one by what it resolves to (SDD-70 §3.7). */
  readonly fields?: Readonly<Record<string, Ty>>;
  /**
   * `load`: how its frames are read, `readFrames` of `@fudic/http/wire/frames`. The generated
   * module hands it over, and only a `.fudapi` with `load` imports it: a page whose functions
   * all speak JSON does not bundle the binary reader for a `load` it does not have.
   */
  readonly read?: (types: DataTypes, body: ReadableStream<Uint8Array>) => Promise<FramedData>;
}

/** The `ctx` of `load` and `layout`: the page's params, typed. */
export type PageContext<P> = Omit<ServerContext<undefined>, 'params'> & { readonly params: P };

export interface PagePiece<F> {
  readonly spec: PageSpec;
  readonly slot: Slot<F>;
  /** Registers the implementation. Returns nothing. */
  handle(fn: F): void;
}

/**
 * What the browser module of a route exposes for its `load` (SDD-68 §3.4): a request to the
 * server, never `load` itself. `load` runs on the server, always.
 */
export interface BrowserLoadPiece<D> {
  /**
   * GET DATA_PREFIX + path, read from its frames (SDD-70 §3.7): resolves with the first one, its
   * `later` fields promises that the frames after it keep.
   */
  fetch(path: string, signal?: AbortSignal): Promise<D>;
}

/**
 * Ask the data endpoint for the `data` of `path`: the same URL the Service Worker reads when it
 * renders a navigation, and the same frames it answers with. Not routed through the worker's
 * cache on purpose — a page asks for this right after a call invalidated it.
 *
 * A non-2xx answer rejects: the `load` threw (a 401 under `use auth`, a 500), and what the
 * server would paint for it is not this function's to decide.
 */
async function fetchData<D>(spec: PageSpec, path: string, signal?: AbortSignal): Promise<D> {
  const response = await fetch(new URL(`${DATA_PREFIX}${path}`, globalThis.location.origin), {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { accept: DATA_FRAMES_TYPE },
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`fudic: the data of ${path} answered ${response.status}`);
  return (await spec.read!(spec, response.body!)).data as D;
}

export function page<F>(spec: PageSpec): PagePiece<F> {
  const slot = new Slot<F>(`${spec.name} of ${spec.id}`, 'server', spec.browser === true);
  const piece = { spec, slot, handle: (fn: F) => slot.set(fn) };
  // On both variants of `load`, as its declaration says. The browser's is the one a route asks
  // with; the server's never runs there, and where one module graph serves both sides — the
  // test harness — it is the one the route's chunk gets.
  return spec.name === 'load'
    ? Object.assign(piece, { fetch: <D>(path: string, signal?: AbortSignal) => fetchData<D>(spec, path, signal) })
    : piece;
}
