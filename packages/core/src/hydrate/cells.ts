// Shared state across shadow boundaries. A signal a parent passes down cannot travel in the
// page's state, so the runtime builds it once, as a cell, and hands the same object to the
// owner and to every consumer, in whatever order they hydrate.
//
//     [[0,2,3],[ 0, 0, {"$":[0,1]} ]]
//      instance 0: [ start=0, count=0 ]    the owner keeps the value in its own slot
//      instance 1: [ {"$":[0,1]} ]         a consumer points at that slot
//
// Only consumers carry the address, so the page is swept for markers up front: otherwise an
// owner hydrating first would get the plain value instead of the cell.

import type { Signal } from '../signal.js';
import { type PageMaps } from './maps.js';

/** The address of a cell: the instance that owns it and the slot it occupies. */
export type CellRef = readonly [owner: number, slot: number];

// Injected rather than imported, so the signal is not loaded until something hydrates.
export type MakeCell = (initial: unknown) => Signal<unknown>;

/** A marker in the page's state, pointing at a cell. */
export interface CellMark {
  /** A cell with a serialized value. */
  readonly $?: CellRef;
  /** A cell holding a function, which its owner has to come up to provide. */
  readonly $f?: CellRef;
}

/** The page's cells. */
export interface Cells {
  /** The cell at that address, built the first time it is asked for. */
  get(ref: CellRef): Signal<unknown>;
  /** Learns the cells of the parts that arrived since the last sweep. */
  sweep(): void;
  /** The function cells instance `id` depends on, whose owners must come up first. */
  eager(id: number): readonly CellRef[];
  /** Instance `id`'s state with its cells in place of markers and of its own cell slots. */
  resolve(id: number): readonly unknown[];
  /** Forgets every cell, for an in-place navigation. */
  clear(): void;
}

/** Whether a state slot is a cell marker rather than a value. */
export function isCellMark(value: unknown): value is CellMark {
  if (typeof value !== 'object' || value === null) return false;
  return refOf(value as CellMark) !== undefined;
}

function refOf(mark: CellMark): CellRef | undefined {
  const ref = mark.$ ?? mark.$f;
  return Array.isArray(ref) && ref.length === 2 ? ref : undefined;
}

const keyOf = (ref: CellRef): string => `${ref[0]}:${ref[1]}`;

export function createCells(maps: PageMaps, make: MakeCell): Cells {
  const cells = new Map<string, Signal<unknown>>();

  const addresses = new Set<string>();
  let swept = 0;
  const sweep = (): void => {
    for (; swept < maps.count; swept += 1) {
      for (const value of maps.slice(swept)) {
        if (isCellMark(value)) addresses.add(keyOf(refOf(value)!));
      }
    }
  };
  sweep();

  const get = (ref: CellRef): Signal<unknown> => {
    const key = keyOf(ref);
    let cell = cells.get(key);
    if (cell === undefined) {
      cell = make(maps.slice(ref[0])[ref[1]]);
      cells.set(key, cell);
    }
    return cell;
  };

  return {
    get,
    sweep,
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
