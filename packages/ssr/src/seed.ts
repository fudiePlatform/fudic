/**
 * The seed: what a request PUBLISHES so the browser can build the same service from it
 * (SDD-38 §4.8).
 *
 * An `inject` in the neutral zone runs on both sides and builds two instances: the server's
 * painted the markup, and the client's is born empty. What closes that gap is not shipping
 * the instance — decision 84 says only values cross — but shipping the VALUE the service was
 * built from, under a token, and letting the browser build its own from the same value.
 *
 * **Only what is published crosses.** A value seeded with `provide`/`provideIn` on the server
 * and not published here stays on the server, and that is precisely what makes it safe to
 * inject a database handle from a `@server` region.
 *
 * The table is module state, read and emptied once per response. A render is one synchronous
 * walk inside a generator and `load(ctx)` is the only `async` function of the system, so the
 * window in which two responses could overlap is the `await` inside a single `load` — which
 * is why `publish` belongs at the end of a load and not in the middle of one.
 */

import type { Token } from '@fudic/di';
import { escapeJson } from './json-block.js';

/** The block id the browser reads the seed from. */
export const SEED_BLOCK = 'fud-di';

let published: Record<string, unknown> | null = null;

/**
 * Publish a value so the CLIENT can build the same service from it.
 *
 * The token's NAME is the key, so two tokens of one name on one route would collide — the
 * names have to be unique per route, and that is the whole of the contract.
 */
export function publish<T>(token: Token<T>, value: T): void {
  published ??= {};
  published[token.name] = value;
}

/**
 * What was published, or `null` when nothing was — and the table is emptied by the read.
 *
 * `null` and not `{}` because the emitted page asks exactly one question of it: whether there
 * is a block to write at all. A page that published nothing writes none, and the browser's
 * root container opens with no seed.
 */
export function publishedSeed(): Record<string, unknown> | null {
  const seed = published;
  published = null;
  return seed;
}

/** The `<script type="application/json" id="fud-di">` block, or `''` when nothing was published. */
export function seedBlock(): string {
  const seed = publishedSeed();
  if (seed === null) return '';
  return `<script type="application/json" id="${SEED_BLOCK}">${escapeJson(JSON.stringify(seed))}</script>`;
}
