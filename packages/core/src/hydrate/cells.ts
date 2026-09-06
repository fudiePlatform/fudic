/**
 * The CELL registry: the one place a shared signal is built, and therefore the only place an
 * identity can be unique (BUG-24 §4.3).
 *
 * The rule fits in a sentence. **The cell is created by the runtime; the chunk receives it.**
 * Parent and child end up holding the same object because nobody constructs it twice — and
 * that is what closes the two halves of §2 at once. A chunk cannot do it: the author writes
 * `const n = signal(start)` and that line is copied verbatim into every instance's closure,
 * so two instances that wanted to share would build two objects. Nor could the ORDER be
 * arranged around: hydration is post-order, so the parent comes up LAST and its `count` does
 * not exist yet when the child is handed its slice. If the object belongs to neither of them,
 * the order in which their code runs stops mattering.
 *
 * ## What the payload says, and what it leaves out
 *
 *     [[0,2,3],[ 0, 0, {"$":[0,1]} ]]
 *      instance 0: [ start=0, count=0 ]      ← the cell's VALUE, in the owner's own slot
 *      instance 1: [ {"$":[0,1]} ]           ← «my slot is that cell»
 *
 * The owner's slot carries the value and not a marker, which is what keeps the bytes of a
 * page unchanged and the initial value readable. The consequence is that the address `(0,1)`
 * is written down ONLY in the consumers' markers — so the registry sweeps the payload once
 * when it is built and collects every address it finds. Without that sweep an owner that
 * hydrated FIRST would find a plain `0` in its own slot and `$p3 ?? signal(start)` would hand
 * it the number.
 *
 * The registry is per PAGE. It outlives both ends on purpose — a child may write with its
 * owner still cold, and the owner, waking up, subscribes and paints the right value — and it
 * dies with the page: `clear()` is what the router calls on every navigation (SDD-20), or a
 * SPA accumulates one cell per instance per route visited.
 */

import { signal, type Signal } from '../signal.js';
import { type PageMaps } from './maps.js';

/** The address of a cell: the instance that owns it, and the slot it occupies in its slice. */
export type CellRef = readonly [owner: number, slot: number];

/**
 * The marker that travels in `fud-state`. Two shapes, and the difference is urgency.
 *
 * It is a WIRE format: `@fudic/ssr` writes exactly these two shapes at the other end and the
 * two packages depend on neither each other nor a third, which is the arrangement `fud-state`
 * itself already has.
 */
export interface CellMark {
  /** A cell WITH a serialised value, in `data[offsets[owner] + slot]`. */
  readonly $?: CellRef;
  /** A cell with no serialisable value — a function. Its owner has to be raised first. */
  readonly $f?: CellRef;
}

export interface Cells {
  /** The cell at that address, materialised the first time anyone asks for it. */
  get(ref: CellRef): Signal<unknown>;
  /**
   * The addresses instance `id` depends on that carry NO value — the ones whose owner has to
   * be alive before this slice can be handed over.
   */
  eager(id: number): readonly CellRef[];
  /**
   * The slice of `id` with its cells in place of its markers — and in place of its own cell
   * slots, which carry a value rather than a marker and would otherwise come through as the
   * plain number they hold.
   */
  resolve(id: number): readonly unknown[];
  /** Empty the registry. The router calls it on navigation (SDD-20). */
  clear(): void;
}

/** Whether a payload slot is a marker rather than a value. */
export function isCellMark(value: unknown): value is CellMark {
  if (typeof value !== 'object' || value === null) return false;
  const mark = value as CellMark;
  return refOf(mark) !== undefined;
}

/** The address a marker points at, whichever of the two shapes it has. */
function refOf(mark: CellMark): CellRef | undefined {
  const ref = mark.$ ?? mark.$f;
  return Array.isArray(ref) && ref.length === 2 ? ref : undefined;
}

const keyOf = (ref: CellRef): string => `${ref[0]}:${ref[1]}`;

export function createCells(maps: PageMaps): Cells {
  const cells = new Map<string, Signal<unknown>>();

  // The sweep of §4.3: every address any marker in the page points at. It is done once, when
  // the registry is built, because whether a slot of MY slice is a cell is a fact written
  // down in SOMEBODY ELSE's — and the two may hydrate in either order.
  const addresses = new Set<string>();
  for (let id = 0; id < maps.count; id += 1) {
    for (const value of maps.slice(id)) {
      if (isCellMark(value)) addresses.add(keyOf(refOf(value)!));
    }
  }

  const get = (ref: CellRef): Signal<unknown> => {
    const key = keyOf(ref);
    let cell = cells.get(key);
    if (cell === undefined) {
      // The initial value is the owner's own slot, which the runtime already knows how to
      // read. Whoever asks first materialises it; everyone after gets the same object, and
      // that is the whole of the identity this file exists for.
      cell = signal(maps.slice(ref[0])[ref[1]]);
      cells.set(key, cell);
    }
    return cell;
  };

  return {
    get,
    eager(id) {
      const out: CellRef[] = [];
      for (const value of maps.slice(id)) {
        if (isCellMark(value) && value.$f !== undefined) out.push(value.$f);
      }
      return out;
    },
    resolve(id) {
      return maps.slice(id).map((value, slot) => {
        if (isCellMark(value)) return get(refOf(value)!);
        return addresses.has(keyOf([id, slot])) ? get([id, slot]) : value;
      });
    },
    clear() {
      cells.clear();
    },
  };
}
