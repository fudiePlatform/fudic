/**
 * What `mount`, `visit`, `renderLayout` and `renderSnippet` share: the options that set up the
 * world a page lives in, and what every result hands back to read and drive it.
 */

import { BASE_URL } from './constants.js';
import { answerWith, type FetchOverride } from './fetch.js';
import { gesturesOf, type Gestures } from './gestures.js';
import { serveOverrides, type ProviderOverride } from './providers.js';
import { queriesOf, type Queries } from './queries.js';
import { controlWith, invalidated } from './sw.js';

/** The world a page of the test lives in. */
export interface WorldOptions {
  /** Services that take the place of the tree's (decision 8.1.11). */
  readonly providers?: readonly ProviderOverride[];
  /** Answers this test's requests in place of the in-memory server (§3.5). */
  readonly fetch?: FetchOverride;
  /** A simulated Service Worker controls the page (§3.6). */
  readonly sw?: boolean;
}

/** What every result reads and drives the page with. */
export interface Harness extends Queries, Gestures {
  /** The paths the simulated worker was told to invalidate (§3.6). Empty without `sw`. */
  readonly invalidated: readonly string[];
}

/**
 * Set up the world for a page at `url`: the server's overrides, the test's `fetch`, the
 * simulated worker and the location. Hands back the overrides, for the client's side.
 */
export function enterWorld(options: WorldOptions, url: string): readonly ProviderOverride[] {
  const providers = options.providers ?? [];
  serveOverrides(providers);
  answerWith(options.fetch);
  controlWith(options.sw === true);
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(new URL(url, BASE_URL).href);
  return providers;
}

/** The queries and gestures over `root`, and what the worker was told. */
export function harnessOf(root: ParentNode): Harness {
  return {
    ...queriesOf(root),
    ...gesturesOf(root),
    get invalidated() {
      return invalidated();
    },
  };
}
