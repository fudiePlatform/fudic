/**
 * What the page tells the runtime: the three `<script type="application/json">` blocks the
 * render writes at the end of the body (SDD-15 §3.3–§3.5), read once, here.
 *
 * `fud-state` is POSITIONAL — `[[offsets], [data]]` — so an instance's `data-fud-id` IS its
 * index in `offsets` and there is no `id → state` table to build. `fud-tree` and `fud-bus`
 * are both `tag → tags`, resolved at compile time: they grow with the catalogue of
 * components, never with the number of instances.
 *
 * **The state is not published in a global** (SDD-17 §3). The `window.__fudState` of the
 * prototypes is gone: the runtime parses the payload once and HANDS each instance its slice.
 * A chunk reads no global, and a component never learns its own `data-fud-id` — which is
 * page identity, not component identity.
 *
 * A page that hydrates nothing publishes none of the three (SDD-15 §3.3), so absence is the
 * base case and not an error: no block means an empty map and an empty payload.
 */

/** `Record<tag, tags>` — the shape of both static maps. */
export type TagMap = Readonly<Record<string, readonly string[]>>;

export interface PageMaps {
  /** Parent tag → the hydratable tags its own SHADOW renders (SDD-15 §3.4). */
  readonly tree: TagMap;
  /** Emitter tag → the tags that must be alive before it (SDD-15 §3.5). */
  readonly bus: TagMap;
  /**
   * The tags that come up WITHOUT a gesture — the control-components (SDD-34 §4.5).
   *
   * It is the one exception to gesture-driven hydration in the whole framework, and it is
   * taken on purpose: a form-associated custom element that is not defined is not labelable,
   * contributes nothing to a `FormData` and has no validity, so a `<label for>` pointing at it
   * points at an element that participates in nothing. That is an accessibility failure, not a
   * deferred optimisation.
   *
   * A flat list and not a map, because it answers no question about composition. Empty for
   * every page that has no control-component, which is the base case.
   */
  readonly eager: readonly string[];
  /**
   * The route's chunk name — `safeName(pattern)` — or `null` when this page has no client
   * half of its own (SDD-39 §3.3, §4.7).
   *
   * Absence is the base case, exactly as it is for the four above: a zero-JS route publishes
   * no block, the capturer never asks about a route, and the page pays neither a byte nor a
   * branch. By PATTERN and not by URL, so `/blog/uno` and `/blog/dos` publish the same name
   * and share one chunk.
   *
   * There is no name→URL table here either, and for the reason `chunks.ts` gives: the URL is
   * DERIVED from the name through the same `resolveChunk` a tag goes through, because
   * `hydrateUrl` is arithmetic over a name and does not care where the name came from.
   */
  readonly route: string | null;
  /**
   * What `load()` returned, trimmed to what the client half reads (SDD-39 §4.8).
   *
   * `{}` when the page publishes no block, which is what a route that never names `data`
   * looks like — and what a route with no `load` at all looks like too.
   */
  readonly data: unknown;
  /**
   * The payload slice of one instance: `data.slice(offsets[id], offsets[id + 1])`.
   *
   * An id outside the payload yields an empty slice, which is also what a claimed host
   * whose `render` destructured nothing yields — the reservation of SDD-15 §3.3 makes the
   * two indistinguishable on purpose.
   */
  slice(id: number): readonly unknown[];
  /**
   * How many instances the payload reserves a slice for — `offsets.length - 1`.
   *
   * The cell registry reads it to sweep the payload once and learn which slots are cells
   * (BUG-24 §4.3). An owner's own slot carries its VALUE and not a marker, so the only place
   * that address is written down is inside the consumers' markers, and finding them all is
   * what lets the owner's slice be resolved too — whichever of the two hydrates first.
   */
  readonly count: number;
  /**
   * What each `later` field the page awaited came to (SDD-70 §3.5): `{ ok }` or `{ error }`,
   * by field. Empty on a page without `@await`, and on one whose route publishes no `data`.
   */
  readonly fields: Readonly<Record<string, Settled>>;
  /** The container map, the last one the page wrote; `null` when it wrote none. */
  readonly ioc: unknown;
  /** The seed of the root container, every entry published so far; `null` when none was. */
  readonly di: Readonly<Record<string, unknown>> | null;
}

/** What a `later` field came to, as the block of its part carries it (SDD-70 §3.5). */
export type Settled = { readonly ok: unknown } | { readonly error: unknown };

/**
 * The block of one part (SDD-70 §3.5), and the shape the blocks at the end of a page without
 * `@await` are read into: the same facts under the same keys, so the maps grow one way.
 */
export interface PartBlock {
  /** `[firstId, offsets, data]`: the slices of the instances this part claimed. */
  readonly state?: readonly [number, readonly number[], readonly unknown[]];
  readonly fields?: Readonly<Record<string, Settled>>;
  readonly di?: Readonly<Record<string, unknown>>;
  readonly ioc?: unknown;
  readonly tree?: TagMap;
  readonly bus?: TagMap;
  readonly eager?: readonly string[];
  readonly route?: string;
  readonly data?: unknown;
}

/** The maps, held in memory and grown one block at a time. */
export interface GrowingMaps extends PageMaps {
  /** Add what one block carries. The slices of a part are new ids: nothing is replaced. */
  absorb(block: PartBlock): void;
}

/** The ids of the three blocks. Written by `writeHydrationBlocks` (SDD-15 §3.3–§3.5). */
export const STATE_BLOCK = 'fud-state';
export const TREE_BLOCK = 'fud-tree';
export const BUS_BLOCK = 'fud-bus';
export const EAGER_BLOCK = 'fud-eager';
/** The route's own two (SDD-39 §3.3). Both may be absent, and absence is the base case. */
export const ROUTE_BLOCK = 'fud-route';
export const DATA_BLOCK = 'fud-data';
/** The injection's two (SDD-38), read by the coordinator before the runtime starts. */
export const IOC_BLOCK = 'fud-ioc';
export const DI_BLOCK = 'fud-di';

const EMPTY: readonly unknown[] = [];

/**
 * The marker an instant travels as in `fud-state`: its milliseconds since the epoch, `null` for
 * an invalid date (SDD-61 §3.12). JSON has no date, so `@fudic/ssr` writes a slot holding one
 * this way, and it is turned back into a `Date` here, once, before any slice is handed out — a
 * `signal(now())` that hydrates holds the instant the server painted, not its text. A wire format
 * like the cell marker: the two packages declare it at each end and depend on neither.
 */
interface InstantMark {
  readonly $d: number | null;
}

/** A mark is an object with `$d` and nothing else: a field of the author's named `$d` is data. */
function isInstantMark(value: object): value is InstantMark {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === '$d';
}

/**
 * `value` with every mark in it turned back into a `Date`, at any depth: the server marks the
 * instants a list or an object nests too. `value` is fresh from `JSON.parse`, nobody else holds
 * it, so it is changed in place.
 */
function fromWire(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (isInstantMark(value)) return new Date(value.$d ?? Number.NaN);
  const fields = value as Record<string, unknown>;
  for (const key of Object.keys(fields)) fields[key] = fromWire(fields[key]);
  return value;
}

/**
 * The maps of a page, empty, to be grown block by block (SDD-70 §4.4).
 *
 * They live in memory and not in the DOM: a component that hydrates minutes later, on a
 * gesture, reads its slice here although its block was removed the moment it was read.
 */
export function growingMaps(): GrowingMaps {
  const slices: (readonly unknown[])[] = [];
  const fields: Record<string, Settled> = {};
  let first: PartBlock = {};
  let ioc: unknown = null;
  let di: Record<string, unknown> | null = null;
  return {
    get tree() {
      return first.tree ?? {};
    },
    get bus() {
      return first.bus ?? {};
    },
    get eager() {
      return first.eager ?? [];
    },
    get route() {
      return first.route ?? null;
    },
    get data() {
      return first.data ?? {};
    },
    get count() {
      return slices.length;
    },
    fields,
    get ioc() {
      return ioc;
    },
    get di() {
      return di;
    },
    slice(id: number): readonly unknown[] {
      return slices[id] ?? EMPTY;
    },
    absorb(block: PartBlock): void {
      // What a page publishes once arrives in its first block: the static maps, the route.
      const { state: _state, fields: _fields, ioc: _ioc, di: _di, ...once } = block;
      first = { ...first, ...once };
      if (block.state !== undefined) {
        const [start, offsets, wired] = block.state;
        const data = wired.map(fromWire);
        for (let i = 0; i + 1 < offsets.length; i += 1) {
          slices[start + i] = data.slice(offsets[i], offsets[i + 1]);
        }
      }
      Object.assign(fields, block.fields);
      // The map is written whole each time it grows, and replaces the last; the seed comes
      // in new entries only.
      if (block.ioc !== undefined) ioc = block.ioc;
      if (block.di !== undefined) di = { ...di, ...block.di };
    },
  };
}

/** The ids of the blocks at the end of a page without `@await`, by the key each fills. */
const CLASSIC: readonly (readonly [string, keyof PartBlock])[] = [
  [TREE_BLOCK, 'tree'],
  [BUS_BLOCK, 'bus'],
  [EAGER_BLOCK, 'eager'],
  [ROUTE_BLOCK, 'route'],
  [DATA_BLOCK, 'data'],
  [IOC_BLOCK, 'ioc'],
  [DI_BLOCK, 'di'],
];

/**
 * The blocks at the end of a page without `@await`, read into one part and REMOVED from the
 * DOM (SDD-70 §4.4): no hydration block stays in the document once it is read. A page that
 * publishes none of them reads as the empty block, which is the base case.
 */
export function readEndBlocks(doc: Document): PartBlock {
  const block: Record<string, unknown> = {};
  const take = (id: string): unknown => {
    const el = doc.getElementById(id);
    if (el === null) return undefined;
    el.remove();
    return JSON.parse(String(el.textContent)) as unknown;
  };
  const state = take(STATE_BLOCK) as [number[], unknown[]] | undefined;
  if (state !== undefined) block['state'] = [0, state[0], state[1]];
  for (const [id, key] of CLASSIC) {
    const value = take(id);
    if (value !== undefined) block[key] = value;
  }
  return block as PartBlock;
}

/** The maps of a page without `@await`: its end blocks, read once and removed. */
export function readPageMaps(doc: Document): GrowingMaps {
  const maps = growingMaps();
  maps.absorb(readEndBlocks(doc));
  return maps;
}
