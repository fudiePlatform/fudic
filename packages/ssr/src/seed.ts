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
 * and not published stays on the server, and that is precisely what makes it safe to inject a
 * database handle from a `@server` region.
 *
 * **The table belongs to the request, not to the process.** It hangs off the request's root
 * container, so publishing says into WHICH response the value goes. It was module state once,
 * emptied at the start of each render, and a server answering two visitors at the same time
 * crossed them: `load` is the only `async` function of the system, and the `await` inside it
 * is a window wide enough for a second response to open its own table, take the first one's
 * values and hand the first one a page built from the second one's.
 */

import { seedOf } from '@fudic/di';
import type { Container } from '@fudic/di';
import { escapeJson } from './json-block.js';

/** The block id the browser reads the seed from. */
export const SEED_BLOCK = 'fud-di';

/**
 * What this response has published, or `null` when nothing has.
 *
 * `null` and not `{}` because the emitted page asks exactly one question of it: whether there
 * is a block to write at all. A page that published nothing writes none, and the browser's
 * root container opens with no seed.
 */
export function publishedSeed(container: Container): Readonly<Record<string, unknown>> | null {
  const seed = seedOf(container);
  return Object.keys(seed).length === 0 ? null : seed;
}

/** The `<script type="application/json" id="fud-di">` block, or `''` when nothing was published. */
export function seedBlock(container: Container): string {
  const seed = publishedSeed(container);
  if (seed === null) return '';
  return `<script type="application/json" id="${SEED_BLOCK}">${escapeJson(JSON.stringify(seed))}</script>`;
}
