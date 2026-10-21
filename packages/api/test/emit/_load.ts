/**
 * Evaluates the modules the emitter writes, as the Vite plugin will serve them: every `fudic:<id>`
 * of a project written to disk, its `fudic:` imports pointed at its siblings, and the contract
 * entries resolved as any package resolves them. Each load is a fresh folder, so a test gets
 * fresh pieces with empty slots.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { emitModule, type ApiContext, type ApiIndex, type ApiSource, type Side } from '../../src/index.js';

/** Inside `node_modules`, so `@fudic/forms/contract` resolves from here as from the package. */
const ROOT = fileURLToPath(new URL('../../node_modules/.fudic-emit/', import.meta.url));

let run = 0;

const fileOf = (id: string): string => `${id.replace(/[^A-Za-z0-9]/gu, '_')}.mjs`;

export interface Loaded {
  /** The module of `id`, evaluated. */
  module<T = Record<string, unknown>>(id: string): Promise<T>;
}

/** Writes every source of the project for `side` and returns the importer. */
export function load(
  index: ApiIndex,
  sources: readonly ApiSource[],
  side: Side,
  ctx: (source: ApiSource) => ApiContext = () => ({}),
): Loaded {
  const dir = join(ROOT, `${String(process.pid)}-${String(run++)}-${side}`);
  mkdirSync(dir, { recursive: true });
  for (const source of sources) {
    const code = emitModule(source, index, ctx(source), side).replace(/(["'])fudic:([^"']+)\1/gu, (_, q: string, id: string) => `${q}./${fileOf(id)}${q}`);
    writeFileSync(join(dir, fileOf(source.id)), code);
  }
  return {
    module: async <T>(id: string) => (await import(/* @vite-ignore */ pathToFileURL(join(dir, fileOf(id))).href)) as T,
  };
}
