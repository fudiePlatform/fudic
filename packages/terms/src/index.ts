/**
 * `@fudic/terms`: what a `.fudspec` term runs on. The stock extension gives every term a `ctx`
 * over the real Playwright page; a project extends it with its own `fudic/bench.js`, through the
 * same `defineExtension`; and `terms/` holds the stock vocabulary.
 */

import { fileURLToPath } from 'node:url';

export { defineExtension, stock } from './stock.js';
export type {
  BenchExtension,
  Box,
  ContextOf,
  Fixtures,
  Term,
  TermContext,
  TermHost,
  TermMeta,
  TermOutcome,
} from './types.js';

/** The folder of the stock terms, absolute: `given/`, `when/` and `then/`. */
export function termsDir(): string {
  return fileURLToPath(new URL('../terms', import.meta.url));
}
