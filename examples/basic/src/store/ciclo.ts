/**
 * What the `/ciclo` page shows: which lifecycle hook ran, of which instance and in which order,
 * and the counter of the route, kept in IndexedDB so that reloading the page keeps it.
 *
 * The record lives here and not in the instances because the last two hooks of an instance run
 * when it is already gone: only the page can still show them.
 */

import { signal } from "@fudic/core";

export interface Entry {
  readonly id: number;
  readonly text: string;
}

/** Every hook that ran, oldest first. */
export const record = signal<readonly Entry[]>([]);

let next = 0;

/** Write down that `who` ran `hook`. */
export function note(who: string, hook: string): void {
  next += 1;
  record.set([...record(), { id: next, text: `${who} · ${hook}` }]);
}

/** Forget what was written down. */
export function clearRecord(): void {
  record.set([]);
}

function store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open("fudic-ciclo", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("kv");
    open.onsuccess = () => resolve(open.result.transaction("kv", mode).objectStore("kv"));
    open.onerror = () => reject(open.error);
  });
}

/** The number saved under `key`, or `0`. */
export async function readNumber(key: string): Promise<number> {
  const kv = await store("readonly");
  return new Promise((resolve) => {
    const get = kv.get(key);
    get.onsuccess = () => resolve(typeof get.result === "number" ? get.result : 0);
    get.onerror = () => resolve(0);
  });
}

/** Save `value` under `key`. */
export async function saveNumber(key: string, value: number): Promise<void> {
  (await store("readwrite")).put(value, key);
}
