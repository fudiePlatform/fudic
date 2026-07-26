/**
 * Shared virtual-module ids and runtime constants (SDD-19). The `\0` prefix marks a
 * module Rollup/Vite will not try to resolve on disk; the plugin owns them via
 * `resolveId`/`load`. Kept in one place so the plugin and the dev server agree on the
 * exact ids and on the stable dev URLs the three bootstraps are served at.
 */

/** Per-route `RenderChunk` wrapper: the pattern is appended (`\0fudic-wrapper:/about`). */
export const WRAPPER_PREFIX = '\0fudic-wrapper:';
export const WW_ID = '\0fudic-ww';
export const SW_ID = '\0fudic-sw';
export const MAIN_ID = '\0fudic-main';

/** The incremental cache namespace (purged on a build `version` control message, §4.9). */
export const CACHE_NAME = 'fudic-v1';

/** Stable dev URLs for the three bootstraps (build uses hashed chunk names instead). */
export const DEV_MAIN_URL = 'fudic-main.js';
export const DEV_SW_URL = 'fudic-sw.js';
export const DEV_WW_URL = 'fudic-ww.js';
