import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'rolldown';

/**
 * The published runtime of `@fudic/core` (SDD-45 §3.3): one bundled, minified ES module per
 * piece, under `runtime/`, beside the `dist/` a bundler consumes. The two are different
 * products — `dist` is source for somebody else's build, `runtime` is the framework's own
 * output, already compiled, that a browser fetches by URL.
 *
 * **Why the framework bundles this and not the application.** Today every app's rollup prunes,
 * chunks and minifies these modules itself, so two apps that use the same `signal.ts` have no
 * reason to emit the same bytes — the result depends on their graph, their minifier settings
 * and their bundler version (§1.2a). Bundling here is what makes identical bytes a
 * CONSTRUCTION and not a coincidence, and identical bytes are the whole premise: one download
 * per origin and per version.
 *
 * Every cross-piece import leaves as an `external` pointing at the published URL, so a piece
 * is a closed box with nothing to discover inside it (§4.3) and no module lands in two of
 * them (§4.3, second rule).
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const read = (file: string): { version: string } =>
  JSON.parse(readFileSync(file, 'utf8')) as { version: string };

/**
 * The version comes from the `package.json`, which owns it — never from an option and never
 * from `fudic.json` (§2, SDD-41). It is what makes these files change, and therefore what
 * identifies them.
 *
 * A piece of ANOTHER package is named with THAT package's version, read the same way, through
 * the `./package.json` export every publishing package declares. Not this one's: the two agree
 * today and the URL would be right by luck, and a URL that is right by luck is a 404 the day
 * somebody releases one package without the other.
 */
const require = createRequire(import.meta.url);
const { version } = read(here('./package.json'));
const versions: Readonly<Record<string, string>> = {
  dom: read(require.resolve('@fudic/dom/package.json')).version,
};

/** `/_fudic/<version>/<pkg>/<piece>.js` — the one shape §3.1 publishes. */
const published = (pkg: string, piece: string): string =>
  `/_fudic/${versions[pkg] ?? version}/${pkg}/${piece}.js`;

/**
 * The pieces of this package, piece name → entry module.
 *
 * Which frontiers exist is the only decision of SDD-45, and §4.3.1 takes it from evidence
 * rather than taste: these are the chunks an application's rollup already emits, i.e. the
 * splits that a real graph proved to be either optional or shared. A module with one consumer
 * gets no piece and travels inside the piece that reaches it — `batch` inside `signal`,
 * `strategy` and `controller` nowhere, because nothing in a browser reaches them.
 *
 * Three of these are STARTUP pieces (§3.4) and their entry lives in `bundle/`, where the
 * uniform `install` name is added without `dist` or the coverage denominator of `src/**`
 * growing a module nobody wrote.
 */
const PIECES: Readonly<Record<string, string>> = {
  hydrate: 'bundle/hydrate.ts',
  'warm-sw': 'bundle/warm-sw.ts',
  'warm-preload': 'bundle/warm-preload.ts',
  channel: 'src/hydrate/warm/channel.ts',
  registry: 'src/hydrate/registry.ts',
  live: 'src/hydrate/live.ts',
  signal: 'src/signal.ts',
  tracking: 'src/tracking.ts',
  computed: 'src/computed.ts',
  effect: 'src/effect.ts',
  subscribe: 'src/subscribe.ts',
  element: 'src/element.ts',
};

/**
 * The source modules that ARE a frontier: reaching one from another piece is an import that
 * must leave the bundle. Keyed by source module and not by piece, because that is how the
 * question arrives — `install.ts` writes `./registry.js`, not `registry`.
 *
 * `registry` and `channel` are here and are not in §4.3.1's table, and the reason is the
 * second rule of §4.3 rather than an opinion. `registry` is reached by `hydrate` AND by
 * `live`; `channel` by `warm-sw` AND by `warm-preload`. Copying either would put the same
 * bytes twice on the origin, which is exactly what this SDD came to stop, so each becomes a
 * piece and both sides declare it external.
 *
 * The startup entries are absent on purpose: nothing imports a startup piece, the coordinator
 * CALLS it.
 */
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/hydrate/registry.ts': 'registry',
  'src/hydrate/live.ts': 'live',
  'src/hydrate/warm/channel.ts': 'channel',
  'src/signal.ts': 'signal',
  'src/tracking.ts': 'tracking',
  'src/computed.ts': 'computed',
  'src/effect.ts': 'effect',
  'src/subscribe.ts': 'subscribe',
  'src/element.ts': 'element',
};

/** Absolute path → published URL, resolved once so the hook below is a lookup. */
const FRONTIER_URLS = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), published('core', piece)]),
);

/**
 * The pieces of OTHER packages this one reaches.
 *
 * `@fudic/dom` must never be inlined here: its `browser` piece is shared by every fudic page
 * in the origin, and a copy of it inside `core/hydrate` would be paid for by every app that
 * hydrates. The bare specifier resolves to one piece because `core` imports one thing from
 * that package — `browserDom`, which lives in `dom/browser` — and the day it imports `emit`
 * as well this map stops being able to answer and has to become per-export.
 */
const EXTERNAL_PACKAGES: Readonly<Record<string, string>> = {
  '@fudic/dom': published('dom', 'browser'),
};

/**
 * Rewrite every frontier import to its published URL.
 *
 * A plugin and not the `external` option because `external` only DECIDES; what is needed here
 * is a substitution — `'./registry.js'`, which means nothing to a browser, has to come out as
 * `/_fudic/<version>/core/registry.js`. `'absolute'` keeps the URL exactly as written: with a
 * plain `true` an id starting with `/` is read as a filesystem path and renormalized against
 * the output directory, which would turn an origin-absolute URL into `../../…`.
 */
const publishedUrls = (self: string): Plugin => ({
  name: 'fudic-published-urls',
  resolveId(source, importer) {
    const external = EXTERNAL_PACKAGES[source];
    if (external !== undefined) return { id: external, external: 'absolute' };
    if (importer === undefined || !source.startsWith('.')) return null;
    // Source is TypeScript and its specifiers are the emitted `.js` (`verbatimModuleSyntax`),
    // so the frontier map — which is keyed by the files that exist — is asked in those terms.
    const file = fileURLToPath(new URL(source.replace(/\.js$/, '.ts'), pathToFileURL(importer)));
    // Its own root is not a frontier: a piece cannot import itself.
    if (file === self) return null;
    const url = FRONTIER_URLS.get(file);
    return url === undefined ? null : { id: url, external: 'absolute' };
  },
});

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => {
    const input = here(`./${entry}`);
    return {
      input: { [piece]: input },
      platform: 'browser' as const,
      plugins: [publishedUrls(input)],
      /**
       * Erase a type-only import instead of leaving it as a side effect.
       *
       * `verbatimModuleSyntax` — which this repo requires and does not relax — turns
       * `import { type WarmChannel } from './warm/channel.js'` into `import {} from '…'`, a
       * bare import that survives into the bundle and, once rewritten, becomes a REQUEST:
       * `hydrate` would fetch `channel` for a name that only ever existed in the type system,
       * and fetch it the worst way there is — discovered inside another piece, one round trip
       * deep, which is the chain §1.5 rule 2 forbids. `dist` keeps `verbatimModuleSyntax`,
       * because there the statement is somebody else's bundler's business; here the emit is
       * the product.
       */
      transform: { typescript: { onlyRemoveTypeImports: false } },
      onLog(level, log, defaultHandler) {
        // Rolldown reports the override above as a conflict on every build. It is the one
        // conflict here that is deliberate, and a warning printed twelve times per build is
        // how everybody learns to stop reading the ones that are not.
        if (log.code === 'CONFIGURATION_FIELD_CONFLICT') return;
        defaultHandler(level, log);
      },
      output: {
        dir: 'runtime',
        format: 'esm' as const,
        // No hash: the version in the URL is the identity (§3.1), and a hash here would make
        // the name unpredictable to the plugin that has to write it into a coordinator.
        entryFileNames: '[name].js',
        minify: true,
        /**
         * The property everything else hangs on (§6.2): building twice produces the same
         * bytes. So nothing that varies with the machine or the moment may reach the output —
         * no source map (which would carry absolute paths), no banner, no legal comments.
         */
        sourcemap: false,
        comments: false,
      },
    };
  }),
);
