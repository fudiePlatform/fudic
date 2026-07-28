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
export const SW_ID = '\0fudic-sw';
export const MAIN_ID = '\0fudic-main';

/** Stable dev/build URLs for the two bootstraps (everything else keeps its hash). */
export const DEV_MAIN_URL = 'fudic-main.js';
export const DEV_SW_URL = 'fudic-sw.js';

/** Where the generated `@server load` endpoints live (SDD-20 §4.5). */
export const DATA_PREFIX = '/_fudic/data';

/** Output directory of the linkable chunks, inside the build output. */
export const LINK_DIR = 'sw/c';

/** Replaced in the emitted Service Worker with the real build id (§4.10). */
export const BUILD_TOKEN = '__FUDIC_BUILD__';

/** The application config file, at the project root. No file → no Service Worker. */
export const SW_CONFIG_FILE = 'sw.json';
