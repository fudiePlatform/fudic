/**
 * The global capturer, assembled (SDD-17 §4.4): the ONE module a fudic page downloads on
 * the initial load, and the only place the order of path 2 is written down.
 *
 *     3. preHydrateBus(tag)   — the bus receivers, IN SEQUENCE
 *     4. prepareTag(tag)      — the subtree of EVERY instance of the tag, in post-order
 *     5. ensureDefined + attachAll — the host, LAST
 *     6. replay               — the original gesture, once
 *
 * What this module imports is what a page pays for on the LOAD, and SDD-45 §4.4.1 is the
 * reason the list is short: the adapter a component paints with and the signal an instance is
 * handed arrive with the warm channel, not with the capturer. Adding a static import of either
 * one back undoes that without anybody noticing.
 *
 * The order 3 → 4 → 5 is this SDD's, and no previous document stated it: bus and cascade
 * were prototyped apart. Bus first because its receivers are siblings EXTERNAL to the host
 * while the subtree is INTERNAL to it, and a child emitting during its own hookup must not
 * find the receivers dead. When the user's handler finally runs, in the replay, everything
 * it presupposes alive is alive.
 *
 * Everything else in this file is the two lifecycle events the page publishes for
 * instrumentation, and nothing depends on anyone listening to them.
 */

import { readPageMaps } from './maps.js';
import { createCells, type Cells } from './cells.js';
import {
  createChunkLoader,
  importChunk,
  type ImportModule,
  type ResolveChunk,
} from './chunks.js';
import { createCascade } from './cascade.js';
import { createBusPrehydrator } from './bus.js';
import { createCapturer } from './capture.js';
import {
  deferredOnce,
  importDeferred,
  type DeferredPieces,
  type ImportDeferred,
} from './deferred.js';
import {
  browserRegistry,
  ID_ATTR,
  idOf,
  instanceState,
  instancesOf,
  openTurn,
  publishTagSource,
  ROUTE_HOST,
  stopwatch,
  type ElementRegistry,
  type HydratedFrom,
  type ReportHydrated,
} from './registry.js';
import { type WarmChannel } from './warm/channel.js';
import { startWarmObserver } from './warm/observer.js';

/** Runtime installed, and not one line of component JavaScript evaluated yet. */
export const READY_EVENT = 'fud:ready';
/** One instance is live. `detail: { id, tag, ms, from }` (SDD-17 §3). */
export const HYDRATED_EVENT = 'fud:hydrated';

export interface HydratedDetail {
  readonly id: number;
  readonly tag: string;
  readonly ms: string;
  readonly from: HydratedFrom;
}

/**
 * The event types the capturer listens to.
 *
 * A listener in the CAPTURE phase on the document hears every event that crosses the shadow
 * boundary (`composed`), whether it bubbles or not. So what decides the list is not what can
 * reach the root but what is a GESTURE: the discrete pointer ones, the keyboard, editing and
 * focus. `focusin`/`focusout` and not `focus`/`blur`, because they are the same moment and one
 * pair is enough.
 *
 * Out on purpose: the continuous ones (`mousemove`, `pointermove`, `mouseover`, `wheel`,
 * `touchmove`, `scroll`), which fire hundreds of times a second — anticipating a download is
 * the viewport's job, not the hover's. And the ones that do not cross a shadow (`change`,
 * `submit`, `invalid`, `toggle`): they never reach the document from inside a component, and
 * a form is already up at install.
 */
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

/** The eager path has no gesture behind it, so there is nothing to replay (SDD-34 §4.5). */
const NOTHING = (): void => {};

/** One step up, through a shadow boundary as readily as through an element. */
function up(node: Node): Node | null {
  // A shadow root's `parentNode` is null by design — the tree is the point — so the climb
  // continues at its host. Duck-typed rather than `instanceof ShadowRoot`: this module is
  // exercised against document doubles, and the question is what the object OFFERS.
  return node.parentNode ?? (node as Partial<ShadowRoot>).host ?? null;
}

/**
 * The outermost hydratable ancestor of an instance, or the instance itself when it has none.
 *
 * The OUTERMOST and not the nearest, because what has to be up is the whole chain: the node a
 * control-component edits may have been composed by a parent that received it from ITS parent,
 * and only the root of that chain can be asked to raise everything under it in one post-order
 * walk. Raising the nearest owner alone would leave the same hole one level higher.
 */
function outermostOwner(instance: Element): Element {
  let out = instance;
  for (let node = up(instance); node !== null; node = up(node)) {
    const el = node as Element;
    if (typeof el.hasAttribute === 'function' && el.hasAttribute(ID_ATTR)) out = el;
  }
  return out;
}

export interface HydrationOptions {
  /** Where the single capture listener goes — the root of the application area (§4.2). */
  readonly root: EventTarget;
  /** The URL of a tag's hydration chunk (§4.6). Injected: the bootstrap knows the mode. */
  readonly resolveChunk: ResolveChunk;
  /**
   * The anticipated-network port (§4.7). Injected by the bootstrap alongside `resolveChunk`
   * because the two answers depend on the same fact — how the page was emitted — and its
   * trigger is the viewport observer, which is a separate axis from hydration.
   */
  readonly warm?: WarmChannel;
  /** The document that publishes the maps and receives the lifecycle events. */
  readonly document?: Document;
  /** How a chunk is fetched. Injected so the runtime is testable off-network. */
  readonly importModule?: ImportModule;
  /**
   * How the pieces of §4.4.1 are fetched — the DOM adapter and the signal, which the load
   * does not pay for. Injected for the same reason as `importModule`, and the default is the
   * real pair of requests.
   */
  readonly importDeferred?: ImportDeferred;
  /** The custom-element registry. Injected for the same reason (§4.4). */
  readonly registry?: ElementRegistry;
  /**
   * Whatever has to be in place before the FIRST chunk is raised (SDD-38 §4.2).
   *
   * Today that is the container tree: a chunk that injects resolves against it, so it must
   * not be raised while the tree is still one round trip away. It is awaited inside path 2
   * and not before installing, and that difference is the whole reason the option exists —
   * installing late means the capturer is not there yet, and a click during that window is
   * not deferred, it is LOST. The capturer goes up first; the gesture waits with everything
   * else.
   */
  readonly ready?: PromiseLike<unknown>;
}

/**
 * What installing hydration hands back — the pieces of the page a NAVIGATION has to touch.
 *
 * Today SDD-20 navigates by replacing the document: every route is a `FetchEvent` the render
 * Service Worker answers with HTML, so the registry dies with the page and nobody has to say
 * so. `clear()` is the hook for the day a route changes IN PLACE — without it a shell that
 * never reloads would keep one cell per instance per route visited, and the second visit to a
 * route would open with the state the first one left behind. That is a leak and a correctness
 * bug at once, which is why the seam is here rather than promised (BUG-24 §4.8).
 */
export interface Hydration {
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

  // What a parent needs to raise a child nothing painted: this page's way of defining a tag.
  // Published here because the loader is this function's, and a chunk cannot be handed one.
  // The loader's own function and not a wrapper around it: `ensureDefined` closes over its
  // memoization and never reads `this`, so the reference IS the capability.
  //
  // Published into the registry rather than pushed into the bridge, and that is what keeps
  // `core/live` out of the load (SDD-45 §4.4.1): the bridge reads the pair from there and
  // arrives inside the chunk of the component that fabricates.
  publishTagSource(loader.ensureDefined, registry);

  /**
   * The pieces the load does not pay for (SDD-45 §4.4.1), ordered by the warm channel and
   * awaited at the top of path 2.
   *
   * `landed` is written the moment they arrive and read without a guard on purpose: every
   * path that can materialise a cell or paint a route awaits them first — the request goes
   * out before `ready` and the await is before the bus, the cascade and any chunk. A cell
   * built before the piece landed would be a signal nobody else shares, so the assertion is
   * the contract of this file and not optimism about it.
   */
  const deferred = deferredOnce(options.importDeferred ?? importDeferred);
  let landed: DeferredPieces | null = null;

  const report: ReportHydrated = (id, tag, ms, from) => {
    const detail: HydratedDetail = { id, tag, ms, from };
    doc.dispatchEvent(new CustomEvent(HYDRATED_EVENT, { detail }));
  };

  const cells = createCells(maps, (initial) => landed!.signal(initial));
  const cascade = createCascade({ maps, cells, loader, registry, state, root: doc, report });
  const preHydrateBus = createBusPrehydrator({
    maps,
    loader,
    registry,
    cascade,
    state,
    root: doc,
    report,
  });

  const ready = options.ready ?? Promise.resolve();

  /**
   * Path 2 for the ROUTE (SDD-39 §4.6), which is the same path with two substitutions.
   *
   * What is downloaded is a module with a default export instead of a tag's definition, and
   * what comes up under it is the hosts the route hands values to — `fud-tree` filed under the
   * route's name — instead of the subtree of a tag. Everything around it is untouched: the
   * instance was marked before the `await`, the gesture was cancelled, and the replay happens
   * once at the end.
   *
   * The route's own slice is resolved like anybody else's: `cells.resolve(id)` turns the
   * markers into the very cells its children are holding, which is what lets a signal declared
   * in the route be the same object a component two levels down reads.
   */
  const raiseRoute = async (
    host: Element,
    id: number,
    replay: () => void,
    arriving: Promise<DeferredPieces>,
  ): Promise<void> => {
    const name = maps.route!;
    await ready;
    // 2c — the pieces of §4.4.1, in flight since the top of path 2 and normally warmed. The
    // adapter is what the route paints with, and the signal is what its cells are made of.
    landed = await arriving;
    await cascade.prepareRoute(name, host);
    const elapsed = stopwatch();
    const factory = await loader.loadRoute(name);
    // A chunk that carries no factory is a URL that answered with something else. The page
    // stays as the server painted it — which is a page that works — and the gesture is
    // replayed anyway, because cancelling it was this runtime's doing.
    if (factory !== null) {
      factory([landed.dom, host, maps.data, ...cells.resolve(id)]).h();
      report(id, name, elapsed(), 'downloaded');
    }
    replay();
  };

  /**
   * Path 2, in the one order §4.4 fixes.
   *
   * It is also the one TURN of SDD-45 §4.12: the document is walked once, here, and every
   * finder the steps below use reads that index instead of walking again. The index is closed
   * with the turn — it is a snapshot, and the only thing that keeps a snapshot honest is that
   * it does not outlive the gesture it was taken for.
   */
  const raise = async (host: Element, id: number, replay: () => void): Promise<void> => {
    const closeTurn = openTurn(doc);
    try {
      await raiseInTurn(host, id, replay);
    } finally {
      closeTurn();
    }
  };

  const raiseInTurn = async (host: Element, id: number, replay: () => void): Promise<void> => {
    // 1 — the two pieces of §4.4.1, ASKED FOR HERE and awaited two lines below. At the top of
    // path 2 so the request is on the network while `ready` is still pending, and on a page
    // with a warm channel it was ordered long ago, when this component came into view.
    const arriving = deferred();
    // The `<body>` is the route's root and nobody else's (SDD-39 §4.2): a custom element
    // needs a dash in its name, so `body` can never be a tag the cascade would know.
    if (maps.route !== null && host.localName === ROUTE_HOST) {
      await raiseRoute(host, id, replay, arriving);
      return;
    }
    const tag = host.localName;
    await ready; // 2b — what the page must have in place before any chunk runs
    // 2c — before the bus and the cascade, because either of them can hand an instance its
    // slice, and a slice is where a cell is materialised.
    landed = await arriving;
    await preHydrateBus(tag); // 3 — the receivers, before anything internal
    await cascade.prepareTag(tag); // 4 — the subtree of every instance, post-order
    const elapsed = stopwatch();
    await loader.ensureDefined(tag); // 5 — the host, last
    // The owner of every empty cell this host depends on, before it is handed anything
    // (BUG-24 §4.6). An owner is an ANCESTOR, so the subtree walk above never reached it:
    // this is the one step of path 2 that climbs.
    await cascade.prepareCells(tag);
    cascade.attachAll(tag);
    report(id, tag, elapsed(), 'downloaded');
    replay(); // 6 — one replay, and only on this path
  };

  const capture = createCapturer({
    state,
    registry,
    onCold: (host, id, replay) => {
      void raise(host, id, replay);
    },
    onShared: (host, id) => {
      // Nothing was downloaded and nothing waited: the instance was ready before the click.
      report(id, host.localName, '0.0', 'shared-chunk');
    },
  });

  for (const type of CAPTURED_TYPES) {
    options.root.addEventListener(type, capture, true);
  }
  // **The one hydration nobody asked for** (SDD-34 §4.5). Every other instance in this
  // framework comes up because the user touched it; a control-component comes up now,
  // because a form-associated element that is not defined is not labelable, adds nothing to
  // a `FormData` and has no validity — and a `<label for>` aimed at it is then aimed at an
  // element that participates in nothing.
  //
  // It goes through the SAME path a gesture takes, and that is what keeps it an exception of
  // one line rather than a second hydration engine. What it does not do is replay anything —
  // there was no gesture to replay.
  //
  // **What comes up is the OWNER, not the marked tag alone**, and that is the sentence above
  // taken seriously. The node a control-component edits is not in its payload: the parent
  // names it with `control="@f.body"` and hands it over as a prop (SDD-34 §4.6), and the
  // cascade hooks children up in post-order, so the child is always hooked up BEFORE the
  // parent composes what it gives it. A marked tag raised on its own is therefore exactly the
  // half-raised element §4.5 refuses to accept: defined, upgraded, and holding no node — no
  // `setFormValue`, no `setValidity`, nothing in anybody's `FormData`. Raising the outermost
  // hydratable ancestor puts the whole chain up in one post-order walk, and the child gets
  // its node through the same `u` any other prop travels in.
  const eagerHosts = new Map<number, Element>();
  for (const tag of maps.eager) {
    // The ROUTE is in this list under its own name, not a tag (SDD-39 §4.6): a `control`
    // written straight in the route, or an `effect` in its `@client`, comes up at install for
    // the same reasons a component's does. `outermostOwner` would land on the `<body>` anyway
    // — it climbs to the outermost `[data-fud-id]` — but the route has no instances to look
    // up, so it is named rather than queried.
    if (tag === maps.route) {
      // `instancesOf` over the one tag a route can be: it already asks for both halves of
      // the question — the element is the `<body>`, and it carries an id.
      for (const body of instancesOf(ROUTE_HOST, doc)) eagerHosts.set(idOf(body), body);
      continue;
    }
    // `instancesOf` and not `querySelectorAll`: a control-component lives INSIDE the shadow
    // root of the component that owns the form, and a query on the document stops there.
    for (const instance of instancesOf(tag, doc)) {
      const host = outermostOwner(instance);
      eagerHosts.set(idOf(host), host);
      // The owner FIRST and then the instance, and the second half is what a route made
      // necessary (SDD-39 §4.10). Raising an owner brings its subtree up with it — through
      // `fud-tree`, which for a component lists every hydratable tag it renders. A ROUTE's
      // entry lists only what it hands a prop to, so a component that receives nothing from
      // it is not on that walk; and since the `<body>` is now the outermost owner of
      // everything, `app-clock` inside a route would be raised by nobody. Asking for it
      // afterwards costs nothing when the cascade already got there — the loop below skips
      // an id that is already hydrated — and is the whole difference when it did not.
      eagerHosts.set(idOf(instance), instance);
    }
  }
  if (eagerHosts.size > 0) {
    void (async (): Promise<void> => {
      for (const [id, host] of eagerHosts) {
        if (state.hydrated.has(id)) continue;
        // Before the await, exactly as the capturer does it: a gesture that lands on this
        // very instance while its chunk is in flight must find it taken (§4.3, path 1).
        state.hydrated.add(id);
        await raise(host, id, NOTHING);
      }
    })();
  }
  if (options.warm !== undefined) {
    const channel = options.warm;
    // A separate axis from everything above: it observes viewports and orders network,
    // and it neither defines nor upgrades anything. A page with no channel simply has
    // no anticipated network — hydration does not change one line (§4.7).
    startWarmObserver({
      maps,
      resolveChunk: options.resolveChunk,
      // The pieces of §4.4.1 travel with the chunk they exist for, in the SAME idle batch
      // (SDD-45 §4.4.1): a component came into view, so something is about to be hydrated,
      // and what hydrating needs is its chunk plus the adapter and the signal. Wrapped here
      // and not decided inside the observer, because which pieces the load skipped is this
      // file's business and warming is a policy about chunks.
      //
      // The order is a real `import` and not a deposit, and the difference does not matter:
      // these are framework pieces that declare and start nothing, so evaluating them runs no
      // line of anybody's component — the founding invariant of §4.7 is untouched.
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
