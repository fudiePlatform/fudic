/**
 * Shared virtual-module ids and runtime constants (SDD-19, SDD-20). Kept in one place so
 * the plugin, the link pass and the dev server agree on the exact ids and on the stable
 * URLs the two bootstraps are served at.
 *
 * ## Why none of these carries the `\0` prefix
 *
 * The Rollup convention is to prefix a generated module's id with `\0` so nothing else
 * tries to resolve it on disk. It cost us every source map: Vite 8 / Rolldown DROPS a
 * `\0`-prefixed module from the map — it never enters `sources` and its segments are gone —
 * silently, with the build green and the `.map` served with a 200. The effect was that the
 * only code invisible to the debugger was the code this plugin writes: the Service Worker
 * bootstrap, the two main-thread entries, and every linked route chunk (whose map came out
 * with `mappings: ""`, empty).
 *
 * Measured, with a minimal build and no fudic in it: same module, same output, only the id
 * changes — `\0fudic-sw` is dropped; `fudic-sw`, `virtual:fudic-sw`, an absolute path and a
 * path with a query are all kept and fully mapped.
 *
 * What the `\0` bought is bought instead by `enforce: 'pre'` on the plugin: its `resolveId`
 * now runs BEFORE `vite:resolve`, so these ids are claimed before anything can look for
 * them on disk. That is the whole trade — one line in the plugin, in exchange for a
 * debuggable build.
 *
 * ## The four passes (SDD-27 §3)
 *
 * A build produces four families of artifacts. They are NOT interchangeable and each one
 * has exactly one consumer:
 *
 * | Pass       | Driver                          | Output                      | Format | `@server load`? | Consumer                              |
 * |------------|---------------------------------|-----------------------------|--------|-----------------|---------------------------------------|
 * | **edge**   | `runEdgePass`                   | `EDGE_DIR` (outside `dist`) | ESM    | **yes**         | Node: prerender, preview, data endpoint |
 * | **page**   | the main Vite build             | `PAGE_DIR`                  | ESM    | no              | nobody — see below                    |
 * | **link**   | `runLinkPass`                   | `LINK_DIR`                  | **CJS**| no              | the Service Worker linker (`new Function`) |
 * | **client** | `discoverComponents` + `?client`| `CLIENT_DIR`                | ESM    | —               | hydration                             |
 *
 * The first three emit the SAME `render`. That is not redundancy waiting to be cleaned up:
 * `edge` carries `load` and therefore may never be published (BUG-09 §4.1), and `link` is
 * CJS because a Service Worker may not `import()`. `client` is a different artifact
 * altogether — `customElements.define` + `static c($props)`, not `render`.
 *
 * `page` is the subtle one: nothing loads its chunks, but the pass CANNOT be removed. It is
 * what pulls each route and its components into the client graph, and it is the ONLY pass
 * that writes the linked asset FILES — `link` runs with `write: false` and re-emits chunks
 * only, so it references `logo-<hash>.png` while `page` produces it. Hence the invariant:
 *
 *   From the `page` pass the CHUNKS are dead weight; the ASSETS never are.
 */

/** Per-route ESM wrapper (edge/prerender): the pattern is appended. */
export const WRAPPER_PREFIX = 'fudic-wrapper:';
/** Per-route LINKABLE wrapper (the SW link pass): same page, no `load` (§4.5). */
export const LINK_PREFIX = 'fudic-link:';
/** Per-route EDGE wrapper in its own nested build (BUG-09 §3.1): same page, WITH `load`. */
export const EDGE_PREFIX = 'fudic-edge:';
export const SW_ID = 'fudic-sw';
/**
 * The coordinator, in DEV, where there is one for the whole app at a stable URL.
 *
 * In a build there is one per combination of pieces and its name carries a hash of its own
 * content (SDD-45 §4.4), so there is no fixed id to name here: `COORD_PREFIX` is how those
 * are addressed. Dev keeps this one because dev builds nothing and optimises nothing — what
 * it needs is a URL that does not move between reloads.
 */
export const MAIN_ID = 'fudic-main';
/** Per-route coordinator in a build: `fudic-main-<hash of its source>` is appended. */
export const COORD_PREFIX = 'fudic-coordinator:';
/** The always-on half of the main thread: register the Service Worker (BUG-31 §T2). */
export const BOOT_ID = 'fudic-boot';

/** Stable dev/build URLs for the bootstraps (everything else keeps its hash). */
export const DEV_MAIN_URL = 'fudic-main.js';
export const DEV_BOOT_URL = 'fudic-boot.js';
export const DEV_SW_URL = 'fudic-sw.js';

/**
 * The built names of the two main-thread entries, which carry the build id (BUG-31 §T1).
 *
 * They used to be fixed and unhashed because a layout referenced `fudic-main.js` LITERALLY
 * in a `<script src>`, and a fixed name is what a hand-written tag can point at. The layout
 * writes a marker now and the emit resolves it, so the name is the emit's to choose — and
 * what it chooses is the build id, like every other derived name. A fixed name was also the
 * reason `install` had to fetch the shell with `cache: 'reload'`.
 *
 * One function, two callers — the plugin names the files and the wrapper writes the URLs —
 * for the same reason `urls.ts` exists: two spellings of a name drift in silence.
 */
/**
 * Whether a file is a coordinator of this build.
 *
 * There used to be one `fudic-main-<id>.js` and asking was an equality. Since SDD-45 §4.4
 * there is one per combination of pieces, each named by a hash of its own source, so the
 * question is a shape: `fudic-main-<hash>-<id>.js`.
 */
export function isMainChunk(fileName: string): boolean {
  return fileName.startsWith(`${MAIN_ID}-`) && fileName.endsWith('.js');
}

export function mainFileName(build: string): string {
  return `fudic-main-${build}.js`;
}
export function bootFileName(build: string): string {
  return `fudic-boot-${build}.js`;
}

/**
 * The two entry URLs a BUILT page writes into its head, with `BUILD_TOKEN` where the id will
 * be. Substituted in `generateBundle` like every other token — same length, maps intact.
 *
 * `main` is now the ROUTE's coordinator and therefore an argument (SDD-45 §4.4): two routes
 * that need different pieces load different modules, and a route with nothing to hydrate
 * names none at all — which arrives here as an empty string, the shape a standalone render
 * already used, and which the head never reads because it writes no tag either.
 */
export function runtimeUrls(
  base: string,
  main: string,
  pieces: readonly string[] = [],
  inline = '',
  boot = true,
): RuntimeEntries {
  return {
    // Empty when this application has no Service Worker (SDD-45 §4.11), and then the head
    // writes no tag for it. There used to be one on every page of such a project, asking for
    // a module whose whole content was `export {};` — a request per page for nothing.
    boot: boot ? `${base}${bootFileName(BUILD_TOKEN)}` : '',
    main: main === '' ? '' : `${base}${main}-${BUILD_TOKEN}.js`,
    pieces,
    inline,
  };
}

/**
 * What a page's `<head>` is handed about the runtime (SDD-45 §3.6, §4.5).
 *
 * Four facts and not two, and the two that arrived are the ones this SDD made knowable. The
 * PIECES are what the coordinator imports at load, so the head can name them all at once and
 * the browser stops discovering them one round trip deep. `inline` is the coordinator's own
 * source, for a layout that asked to carry it in the document rather than fetch it; empty
 * when there is nothing to embed, which is dev, where nothing is built (§4.15).
 *
 * None of the four is the `base` of the application except the two that are its own files:
 * a piece's URL is origin-absolute and shared by every app of the origin (§4.2).
 */
export interface RuntimeEntries {
  /** The worker registrar, or `''` when this project has none and writes no tag (§4.11). */
  readonly boot: string;
  readonly main: string;
  readonly pieces: readonly string[];
  readonly inline: string;
}

/**
 * Where the dev server publishes the CLIENT module of a component: `<base>@fudic/h/<tag>.js`.
 *
 * In a build a component's hydration chunk is a real emitted file whose URL the manifest's
 * arithmetic derives. In dev there is no build and no hash, and the module exists only as
 * `<path>.fud?client` — an id nothing serves. Without a URL, `resolveChunk` has no answer
 * and dev cannot hydrate at all, whatever the runtime does (SDD-17 §4.7.1).
 *
 * By TAG and not by path, because the tag is what the runtime holds: it reads it off
 * `host.localName`, exactly as it does in a build.
 */
export const DEV_CLIENT_PREFIX = '@fudic/h/';

/** Where the generated `@server load` endpoints live (SDD-20 §4.5). */
export const DATA_PREFIX = '/_fudic/data';

/** Output directory of the `link` pass: the linkable CJS chunks, inside the build output. */
export const LINK_DIR = 'sw/c';

/**
 * Chunk-NAME prefixes of the two passes that ride inside the main build. A chunk emitted
 * with `name: 'h/app-badge'` lands in `<assetsDir>/h/app-badge-<hash>.js`, so these name
 * the pass independently of where `assetsDir` happens to point — which is why the prune
 * and the rename match on `chunk.name`, never on the output path.
 *
 * `page` chunks have no consumer (SDD-27 §5.1) and are pruned before the bundle is
 * written. `client` chunks get their own prefix because they are keyed by TAG, and a flat
 * directory would mix them with the render chunks that share the same tag names.
 */
export const PAGE_NAME_PREFIX = 'c';
export const CLIENT_NAME_PREFIX = 'h';

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
