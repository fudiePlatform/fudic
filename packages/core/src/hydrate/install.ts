// The one module a page loads to hydrate. A gesture on a component that is not up yet is
// withheld, and the component comes up in this order:
//
//   1. the components that listen to its events
//   2. the subtree of every instance of its tag, deepest first
//   3. its own definition and state
//   4. the gesture, replayed once
//
// What this module imports is what every page pays on load. The DOM adapter and the signal
// are imported only when something hydrates: do not add a static import of either.

import { readPageMaps, type PartBlock } from './maps.js';
import type { PartsOptions } from './parts.js';
import { createCells, type Cells } from './cells.js';
import { createChunkLoader, importChunk, type ImportModule, type ResolveChunk } from './chunks.js';
import { createCascade } from './cascade.js';
import { createBusPrehydrator } from './bus.js';
import { createCapturer } from './capture.js';
import { deferredOnce, importDeferred, type DeferredPieces, type ImportDeferred } from './deferred.js';
import { browserRegistry, publishTagSource, type ElementRegistry } from './registry.js';
import { instanceState, openTurn, ROUTE_HOST } from './instances.js';
import { stopwatch, type HydratedFrom, type ReportHydrated } from './report.js';
import { createArrivals } from './arrivals.js';
import { createEagerRaiser } from './eager.js';
import { type WarmChannel } from './warm/channel.js';
import { startWarmObserver } from './warm/observer.js';

/** Dispatched on the document once hydration is installed, before any component code runs. */
export const READY_EVENT = 'fud:ready';
/** Dispatched on the document each time an instance comes up. */
export const HYDRATED_EVENT = 'fud:hydrated';

export interface HydratedDetail {
  readonly id: number;
  readonly tag: string;
  readonly ms: string;
  readonly from: HydratedFrom;
}

// Listened to in the capture phase, which hears every composed event crossing a shadow
// boundary. Only discrete gestures: continuous ones fire hundreds of times a second, and
// `change`/`submit`/`invalid`/`toggle` never leave a shadow root.
const CAPTURED_TYPES: readonly string[] = [
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'keydown',
  'keyup',
  'beforeinput',
  'input',
  'focusin',
  'focusout',
];

export interface HydrationOptions {
  /** Where the capture listeners go. */
  readonly root: EventTarget;
  /** The URL of a tag's hydration chunk. */
  readonly resolveChunk: ResolveChunk;
  /** Downloads chunks ahead of time for components in view. */
  readonly warm?: WarmChannel;
  /** Defaults to the global `document`. */
  readonly document?: Document;
  /** Defaults to a dynamic `import()`. */
  readonly importModule?: ImportModule;
  /** Defaults to importing the DOM adapter and the signal. */
  readonly importDeferred?: ImportDeferred;
  /** Defaults to `customElements`. */
  readonly registry?: ElementRegistry;
  /**
   * Awaited before the first chunk runs. The capture listeners are installed before it
   * settles, so a gesture made meanwhile waits instead of being lost.
   */
  readonly ready?: PromiseLike<unknown>;
  /** Reads a page streamed in parts. Without it the page is read whole. */
  readonly parts?: (options: PartsOptions) => Promise<void>;
  /** Builds the page's dependency container from its map and seed. No chunk runs before it. */
  readonly inject?: (map: unknown, seed: Readonly<Record<string, unknown>> | undefined) => PromiseLike<unknown>;
}

export interface Hydration {
  /** The page's shared state cells. `cells.clear()` resets them for an in-place navigation. */
  readonly cells: Cells;
}

export function installHydration(options: HydrationOptions): Hydration {
  const doc = options.document ?? document;
  const registry = options.registry ?? browserRegistry;
  const maps = readPageMaps(doc);
  const state = instanceState();
  const loader = createChunkLoader({
    resolveChunk: options.resolveChunk,
    registry,
    importModule: options.importModule ?? importChunk,
  });
  // So a parent can bring up a child it creates in the browser.
  publishTagSource(loader.ensureDefined, registry);

  const deferred = deferredOnce(options.importDeferred ?? importDeferred);
  // Set before any cell is built: every path awaits the deferred pieces first.
  let landed: DeferredPieces | null = null;

  const report: ReportHydrated = (id, tag, ms, from) => {
    const detail: HydratedDetail = { id, tag, ms, from };
    doc.dispatchEvent(new CustomEvent(HYDRATED_EVENT, { detail }));
  };

  const cells = createCells(maps, (initial) => landed!.signal(initial));
  const cascade = createCascade({ maps, cells, loader, registry, state, root: doc, report });
  const preHydrateBus = createBusPrehydrator({ maps, registry, cascade, state, root: doc, report });
  const arrivals = createArrivals(maps, options.parts !== undefined);

  const inject = options.inject;
  const injected =
    inject === undefined
      ? undefined
      : arrivals.done.then(() => (maps.ioc === null ? undefined : inject(maps.ioc, maps.di ?? undefined)));
  const ready =
    injected === undefined ? (options.ready ?? Promise.resolve()) : Promise.all([options.ready, injected]);

  // A route downloads a module with a default export instead of a tag's definition, and
  // brings up the components it hands values to instead of a tag's subtree.
  const raiseRoute = async (
    host: Element,
    id: number,
    replay: () => void,
    arriving: Promise<DeferredPieces>,
  ): Promise<void> => {
    // Its view spans every part.
    await arrivals.done;
    const name = maps.route!;
    await ready;
    landed = await arriving;
    await cascade.prepareRoute(name, host);
    const elapsed = stopwatch();
    const factory = await loader.loadRoute(name);
    // No factory: the page stays as the server rendered it, and the gesture still replays.
    if (factory !== null) {
      factory([landed.dom, host, maps.data, ...cells.resolve(id)], maps.fields).h();
      report(id, name, elapsed(), 'downloaded');
    }
    replay();
  };

  const raiseInTurn = async (host: Element, id: number, replay: () => void): Promise<void> => {
    // Requested first, so the download overlaps with `ready`.
    const arriving = deferred();
    const arrival = arrivals.until(id);
    if (arrival !== null) await arrival;
    if (maps.route !== null && host.localName === ROUTE_HOST) {
      await raiseRoute(host, id, replay, arriving);
      return;
    }
    const tag = host.localName;
    await ready;
    landed = await arriving;
    await preHydrateBus(tag);
    const ms = await cascade.raise(tag);
    report(id, tag, ms, 'downloaded');
    replay();
  };

  const raise = async (host: Element, id: number, replay: () => void): Promise<void> => {
    // The document is walked once per gesture; every finder reads that index.
    const closeTurn = openTurn(doc);
    try {
      await raiseInTurn(host, id, replay);
    } catch (error) {
      // Replayed anyway: a withheld gesture left pending would block every later one on
      // this host. The error still reaches the console.
      replay();
      throw error;
    } finally {
      closeTurn();
    }
  };

  const capture = createCapturer({
    state,
    registry,
    onCold: (host, id, replay) => {
      void raise(host, id, replay);
    },
    onShared: (host, id) => {
      report(id, host.localName, '0.0', 'shared-chunk');
    },
  });
  for (const type of CAPTURED_TYPES) {
    options.root.addEventListener(type, capture, true);
  }

  const raiseEager = createEagerRaiser({ maps, state, doc, arrivals, raise });
  raiseEager();

  if (options.parts !== undefined) {
    const onPart = (block: PartBlock): void => {
      maps.absorb(block);
      cells.sweep();
      arrivals.wake();
      raiseEager();
    };
    void options.parts({ document: doc, onPart }).then(() => {
      arrivals.finish();
      raiseEager();
    });
  }

  if (options.warm !== undefined) {
    const channel = options.warm;
    startWarmObserver({
      maps,
      resolveChunk: options.resolveChunk,
      // A component in view is about to hydrate: its chunk and the deferred pieces travel together.
      channel: {
        warm: (urls, tags) => {
          void deferred();
          channel.warm(urls, tags);
        },
      },
      root: doc,
    });
  }

  doc.dispatchEvent(new CustomEvent(READY_EVENT));
  return { cells };
}
