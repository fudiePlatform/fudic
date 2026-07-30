/**
 * Shared virtual-module ids and runtime constants (SDD-19, SDD-20). The `\0` prefix
 * marks a module Rollup/Vite will not try to resolve on disk; the plugin owns them via
 * `resolveId`/`load`. Kept in one place so the plugin, the link pass and the dev server
 * agree on the exact ids and on the stable URLs the two bootstraps are served at.
 */

/** Per-route ESM wrapper (edge/prerender): the pattern is appended. */
export const WRAPPER_PREFIX = '\0fudic-wrapper:';
/** Per-route LINKABLE wrapper (the SW link pass): same page, no `load` (§4.5). */
export const LINK_PREFIX = '\0fudic-link:';
/** Per-route EDGE wrapper in its own nested build (BUG-09 §3.1): same page, WITH `load`. */
export const EDGE_PREFIX = '\0fudic-edge:';
export const SW_ID = '\0fudic-sw';
export const MAIN_ID = '\0fudic-main';

/** Stable dev/build URLs for the two bootstraps (everything else keeps its hash). */
export const DEV_MAIN_URL = 'fudic-main.js';
export const DEV_SW_URL = 'fudic-sw.js';

/** Where the generated `@server load` endpoints live (SDD-20 §4.5). */
export const DATA_PREFIX = '/_fudic/data';

/** Output directory of the linkable chunks, inside the build output. */
export const LINK_DIR = 'sw/c';

/**
 * Where the SERVER-ONLY artifacts are written: sibling of `outDir`, never inside it
 * (BUG-09 §4.1). `outDir` is what a static host publishes; the edge wrappers call
 * `@server load` and drag its whole import graph, so they must not be in there.
 */
export const EDGE_DIR = '.fudic/edge';

/**
 * Replaced in the emitted Service Worker with the real build id (§4.10).
 *
 * It measures EXACTLY what the build id measures — 8 characters — and that is not
 * cosmetic (BUG-05 §4.4). The substitution runs on the code the nested build already
 * produced, after its source map was generated: a token of a different length would shift
 * every column that follows it and leave a map that validates and lies. Same length, and
 * the map stays correct by construction.
 */
export const BUILD_TOKEN = '__FUDB__';
/** The build id is a hex digest cut to the token's length, so substituting moves nothing. */
export const BUILD_ID_LENGTH = BUILD_TOKEN.length;

/** The application config file, at the project root. No file → no Service Worker. */
export const SW_CONFIG_FILE = 'sw.json';
