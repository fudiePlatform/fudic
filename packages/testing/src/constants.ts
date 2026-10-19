/**
 * The harness's fixed names, in a module that imports nothing: the setup file and the
 * harness read them in every test file, and reaching them through `config.ts` would load the
 * whole plugin there first.
 */

/** Where a page of the test lives unless it says otherwise. */
export const BASE_URL = 'http://localhost/';

/** The key the project root is provided under, for the worker to find the cache (§4.2). */
export const ROOT_KEY = 'fudicRoot';

/** Where the harness writes the host pages and wrappers it generates, under the root. */
export const CACHE_FOLDER = 'node_modules/.fudic-test';

/**
 * The export through which a `.fud` tells the harness its own file, so a host page can link
 * it (§4.2). Added in the `fudic` environment only: production modules never carry it.
 */
export const FILE_EXPORT = '$file';

/** The key the plugin options and Vite's `base` are provided under, for the in-memory server. */
export const OPTIONS_KEY = 'fudicOptions';

/**
 * Where the `fudic` environment leaves the function that gives the scope a new window, which
 * the setup calls at the end of every file (BUG-51). A worker runs many files and keeps one
 * environment for all of them, and a window outlives its file: a tag the file defined stays
 * defined, bound to a class of modules the next file no longer has. A new window per file is
 * what a new environment per file gave, without starting the worker again.
 */
export const RENEW_WINDOW = Symbol.for('fudic.testing.renewWindow');
