/**
 * Where a fudic project keeps its sources (BUG-20 §3.1).
 *
 * This is a leaf package on purpose. The CLI writes these directories and the Vite plugin
 * reads them, but `@fudic/vite` is a devDependency of `@fudic/cli` and the reverse edge
 * would invert the boundary — the generator does not get to rule the compiler — while the
 * `@fudic/compiler` both share is fs-free by design and knows nothing about directories.
 * With nowhere to put it, the convention was copied into four literals across two packages
 * that only agreed by habit. This is the place they were missing.
 *
 * What belongs here is narrow, and the rule is the whole point: *a name two packages must
 * agree on and neither one owns*. Versions, generated file names and build output names
 * all have an owner already, and adding them would turn this into a drawer of strings.
 *
 * SDD-45 adds three, and each one passes that rule rather than bending it: the runtime
 * directory is written by the framework's build and read by every application's build; the
 * runtime cache is opened by every Service Worker of an origin, which is by definition more
 * than one package's worth of code; and the marker inside it is written by one worker and
 * read by all the others. None of the three has an owner to put it with.
 */

/** Where a fudic project keeps its sources. Not an option: a convention (§4.2). */
export const SRC_DIR = 'src';
export const ROUTES_DIR = 'src/routes';
export const COMPONENTS_DIR = 'src/components';
export const LAYOUTS_DIR = 'src/layouts';
/**
 * The translation catalogs, `<locale>.json` each (SDD-58 §4.10). `fudic translate` writes them;
 * the plugin and the language server read them.
 */
export const LOCALES_DIR = 'src/locales';
/**
 * The global level of every server function's chain (SDD-56 §3.3): its default export is a
 * `chain()`. Optional; without it the global level is empty. Both halves import it: the plugin
 * on the server, the compiler's stubs in the browser.
 */
export const HTTP_FILE = 'src/http.ts';

/**
 * Where the published runtime lives on the origin, OUTSIDE every app's `base`
 * (SDD-45 §3.1). It starts with `_` for the same reason SDD-42's specifier does: no
 * application route may collide with it.
 *
 * It is the rule of this package exactly: the framework's build writes these files and
 * every application's build links them, and neither of the two owns the name.
 */
export const RUNTIME_DIR = '_fudic';

/**
 * The origin-wide cache holding `/_fudic/<version>/*`, opened by the page's Service Worker
 * and by every other worker of the origin (SDD-45 §4.8).
 *
 * **It carries no app segment, and that is the point.** BUG-33 namespaces every other cache
 * as `<kind>-<app>-<build>` because two applications were deleting each other's; this is the
 * one they are meant to share, so it is deliberately outside that scheme — and, because
 * `isStaleCache` only recognises the four kinds, outside its purge as well.
 *
 * The version is what keeps two framework versions from colliding, the same way it does in
 * the URL: `app-1` on 1.0 and `app-2` on 2.0 never read each other's bytes.
 *
 * The prefix is exported because the sweep of §4.9 needs it: a worker walks the origin's
 * caches looking for OTHER versions of this same cache, and slicing a version back off a
 * name cannot be done by hand — `fudic-runtime-0.0.1-beta.1` would cut in the wrong place.
 */
export const RUNTIME_CACHE_PREFIX = 'fudic-runtime-';

export const runtimeCacheName = (version: string): string =>
  `${RUNTIME_CACHE_PREFIX}${version}`;

/**
 * Inside that cache, who is still using this version (SDD-45 §4.9). One entry per
 * application, rewritten with the current date every time that application's worker
 * activates.
 *
 * It exists because a shared cache has no owner: no worker can know whether another
 * application still runs this framework version, so without a marker nobody dares delete
 * anything and the cache only ever grows — the opposite of saving quota. With it, the rule
 * is local and self-healing: a worker deletes a version whose markers are all stale, and an
 * application that moves on, or disappears, simply stops refreshing its own.
 */
export const runtimeMarkerUrl = (app: string): string => `/${RUNTIME_DIR}/marker/${app}`;

/**
 * Where the generated `@server load` endpoints live (SDD-20 §4.5): the plugin serves them and
 * the Service Worker asks them. It was a copy in each of the two until SDD-56.
 */
export const DATA_PREFIX = '/_fudic/data';

/**
 * Where a server function answers (SDD-56 §4.1): the compiler writes the URL into the client
 * stub, the plugin and every adapter serve it, and the Service Worker steps aside for it.
 */
export const FN_PREFIX = '/_fudic/fn';

/**
 * The only URL of `_error.fud` (SDD-56 §4.8): `errorPages` navigates to it from the browser
 * and the server paints it.
 */
export const ERROR_PREFIX = '/_fudic/error';

/**
 * The error page, at the top of the routes directory (SDD-56 §3.6): the plugin keeps it out of
 * the route table, and the editor types its `data` as `{ status, title, detail? }`.
 */
export const ERROR_FILE = '_error.fud';

/**
 * page → SW: "forget the data of these paths" (SDD-56 §4.9), with a `MessagePort` the worker
 * answers on once it has. The stub of a server function sends it and the worker handles it,
 * and neither package depends on the other.
 */
export const INVALIDATE_MESSAGE = 'fudic:invalidate';
