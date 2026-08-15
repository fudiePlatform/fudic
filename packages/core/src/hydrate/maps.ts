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
   * The payload slice of one instance: `data.slice(offsets[id], offsets[id + 1])`.
   *
   * An id outside the payload yields an empty slice, which is also what a claimed host
   * whose `render` destructured nothing yields — the reservation of SDD-15 §3.3 makes the
   * two indistinguishable on purpose.
   */
  slice(id: number): readonly unknown[];
}

/** The ids of the three blocks. Written by `writeHydrationBlocks` (SDD-15 §3.3–§3.5). */
export const STATE_BLOCK = 'fud-state';
export const TREE_BLOCK = 'fud-tree';
export const BUS_BLOCK = 'fud-bus';

const EMPTY: readonly unknown[] = [];

/** The parsed content of a block, or `null` when the page does not publish it. */
function readBlock(doc: Document, id: string): unknown {
  const el = doc.getElementById(id);
  return el === null ? null : (JSON.parse(String(el.textContent)) as unknown);
}

function readTagMap(doc: Document, id: string): TagMap {
  return (readBlock(doc, id) as TagMap | null) ?? {};
}

export function readPageMaps(doc: Document): PageMaps {
  // `[[0], []]` is the empty payload with the same shape as a real one: one offset, no
  // data. Every slice of it is empty, so nothing downstream has to ask whether it is there.
  const [offsets, data] = (readBlock(doc, STATE_BLOCK) as [number[], unknown[]] | null) ?? [
    [0],
    [],
  ];
  return {
    tree: readTagMap(doc, TREE_BLOCK),
    bus: readTagMap(doc, BUS_BLOCK),
    slice(id: number): readonly unknown[] {
      const start = offsets[id];
      const end = offsets[id + 1];
      return start === undefined || end === undefined ? EMPTY : data.slice(start, end);
    },
  };
}
