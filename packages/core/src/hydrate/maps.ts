// What the page tells the runtime, in JSON blocks the server writes. The state is
// positional, `[[offsets], [data]]`: an instance's `data-fud-id` is its index in `offsets`.
// The blocks are read once, kept in memory and removed from the document. A page that
// hydrates nothing writes none of them.

/** Tag → tags. */
export type TagMap = Readonly<Record<string, readonly string[]>>;

export interface PageMaps {
  /** Tag → the hydratable tags its shadow root renders. */
  readonly tree: TagMap;
  /** Tag → the tags listening to its events, which come up before it. */
  readonly bus: TagMap;
  /** The tags that come up without a gesture: form-associated controls. */
  readonly eager: readonly string[];
  /** The name of the route's chunk, or `null` when the route has no browser code. */
  readonly route: string | null;
  /** The part of the route's `load()` result its browser code reads; `{}` when none. */
  readonly data: unknown;
  /** The state of one instance. Empty for an id outside the state. */
  slice(id: number): readonly unknown[];
  /** How many instances have state so far. */
  readonly count: number;
  /** What each awaited `later` field settled to. */
  readonly fields: Readonly<Record<string, Settled>>;
  /** The dependency container's map, or `null`. */
  readonly ioc: unknown;
  /** The root container's seed, or `null`. */
  readonly di: Readonly<Record<string, unknown>> | null;
}

export type Settled = { readonly ok: unknown } | { readonly error: unknown };

/** One part of a streamed page. A page read whole is read into one of these too. */
export interface PartBlock {
  /** `[firstId, offsets, data]`: the state of the instances in this part. */
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

export interface GrowingMaps extends PageMaps {
  /** Adds one part. Its state belongs to new ids, so nothing is replaced. */
  absorb(block: PartBlock): void;
}

/** The ids of the blocks a page writes. */
export const STATE_BLOCK = 'fud-state';
export const TREE_BLOCK = 'fud-tree';
export const BUS_BLOCK = 'fud-bus';
export const EAGER_BLOCK = 'fud-eager';
export const ROUTE_BLOCK = 'fud-route';
export const DATA_BLOCK = 'fud-data';
export const IOC_BLOCK = 'fud-ioc';
export const DI_BLOCK = 'fud-di';

const EMPTY: readonly unknown[] = [];

// JSON has no dates: the server writes an instant as `{ $d: ms }`, `null` when invalid.
interface InstantMark {
  readonly $d: number | null;
}

// Only `$d` and nothing else: an author's field named `$d` among others is data.
function isInstantMark(value: object): value is InstantMark {
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === '$d';
}

// Turns every instant mark back into a `Date`, at any depth. `value` comes fresh from
// `JSON.parse`, so it is changed in place.
function fromWire(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (isInstantMark(value)) return new Date(value.$d ?? Number.NaN);
  const fields = value as Record<string, unknown>;
  for (const key of Object.keys(fields)) fields[key] = fromWire(fields[key]);
  return value;
}

/** Empty maps, grown one part at a time. */
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
      // The container map is rewritten whole each time; the seed only gains entries.
      if (block.ioc !== undefined) ioc = block.ioc;
      if (block.di !== undefined) di = { ...di, ...block.di };
    },
  };
}

const CLASSIC: readonly (readonly [string, keyof PartBlock])[] = [
  [TREE_BLOCK, 'tree'],
  [BUS_BLOCK, 'bus'],
  [EAGER_BLOCK, 'eager'],
  [ROUTE_BLOCK, 'route'],
  [DATA_BLOCK, 'data'],
  [IOC_BLOCK, 'ioc'],
  [DI_BLOCK, 'di'],
];

/** Reads the blocks at the end of a page that is not streamed, removing them. */
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

export function readPageMaps(doc: Document): GrowingMaps {
  const maps = growingMaps();
  maps.absorb(readEndBlocks(doc));
  return maps;
}
