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
 * Which frontiers exist is the only decision of SDD-45, and it is DERIVED — from what this
 * package exports, never from the chunks one example happens to emit. Deducing it from an
 * example is deducing it from a coincidence, and `examples/pieces-bench/check.mjs` is what
 * holds the derivation to its three rules: no module in two pieces, no exported value without
 * a piece, no piece below its frontier.
 *
 * A module with one consumer gets no piece and travels inside the piece that reaches it —
 * `batch` inside `signal`, whose entry therefore re-exports it, because being INSIDE a piece
 * is not the same as being reachable FROM it. `strategy` is the declared exception: a route
 * strategy is read out of the source by the compiler and never reaches a browser.
 *
 * Three of these are STARTUP pieces (§3.4) and their entry lives in `bundle/`, where the
 * uniform `install` name is added without `dist` or the coverage denominator of `src/**`
 * growing a module nobody wrote. `signal` has an entry there for the other reason: to publish
 * two exports whose modules are one piece.
 */
const PIECES: Readonly<Record<string, string>> = {
  hydrate: 'bundle/hydrate.ts',
  'warm-sw': 'bundle/warm-sw.ts',
  'warm-preload': 'bundle/warm-preload.ts',
  registry: 'src/hydrate/registry.ts',
  live: 'src/hydrate/live.ts',
  signal: 'bundle/signal.ts',
  tracking: 'src/tracking.ts',
  computed: 'src/computed.ts',
  effect: 'src/effect.ts',
  subscribe: 'src/subscribe.ts',
  element: 'src/element.ts',
};

/**
 * Source module → the piece that owns it, for every module that is a frontier. Reaching one
 * from ANOTHER piece is an import that must leave the bundle; reaching it from its own piece
 * is not a frontier at all, which is what lets an entry in `bundle/` gather two modules.
 *
 * Keyed by source module and not by piece, because that is how the question arrives —
 * `install.ts` writes `./registry.js`, not `registry`.
 *
 * `registry` is here and is not in §4.3.1's table, and the reason is the second rule of §4.3
 * rather than an opinion: it is reached by `hydrate` AND by `live`, and copying it would put
 * the same bytes twice on the origin, which is exactly what this SDD came to stop.
 *
 * `warm/channel.ts` is NOT here, and that is the one written exception to that rule (§4.3,
 * second rule): it is reached by both warm channels, so it should be a piece — but the two
 * channels are exclusive, an app has a Service Worker or it does not, so nobody ever downloads
 * both copies. As a piece it was 184 bytes paying a 150-byte frontier for a saving that can
 * never be collected. The exception is written in `check.mjs` too, where it is checked.
 *
 * The startup entries are absent on purpose: nothing imports a startup piece, the coordinator
 * CALLS it.
 */
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/hydrate/registry.ts': 'registry',
  'src/hydrate/live.ts': 'live',
  'src/signal.ts': 'signal',
  'src/batch.ts': 'signal',
  'src/tracking.ts': 'tracking',
  'src/computed.ts': 'computed',
  'src/effect.ts': 'effect',
  'src/subscribe.ts': 'subscribe',
  'src/element.ts': 'element',
};

/** Absolute path → the piece that owns it, resolved once so the hook below is a lookup. */
const FRONTIER_PIECES = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), piece]),
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
 * A published piece, leaving as a URL and declared free of side effects.
 *
 * `'absolute'` keeps the URL exactly as written: with a plain `true` an id starting with `/`
 * is read as a filesystem path and renormalized against the output directory, which would turn
 * an origin-absolute URL into `../../…`.
 *
 * `moduleSideEffects: false` because a piece of this framework declares things and starts
 * nothing. Without it a bundler assumes an external module may do something on import and
 * keeps a bare `import "…"` for every one it was offered and did not use — a request bought
 * for nothing, and discovered one round trip deep, which is the chain §1.5 rule 2 forbids.
 */
const external = (url: string) =>
  ({ id: url, external: 'absolute', moduleSideEffects: false }) as const;

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
    const other = EXTERNAL_PACKAGES[source];
    if (other !== undefined) return external(other);
    if (importer === undefined || !source.startsWith('.')) return null;
    // Source is TypeScript and its specifiers are the emitted `.js` (`verbatimModuleSyntax`),
    // so the frontier map — which is keyed by the files that exist — is asked in those terms.
    const file = fileURLToPath(new URL(source.replace(/\.js$/, '.ts'), pathToFileURL(importer)));
    const owner = FRONTIER_PIECES.get(file);
    // A module of the piece being built is not a frontier: `bundle/signal.ts` reaches
    // `src/signal.ts` and `src/batch.ts`, and both belong to `signal`. A piece cannot import
    // itself, and the check that says so is about the PIECE and not about the entry file —
    // an entry that gathers two modules has two ways to arrive at itself.
    return owner === undefined || owner === self ? null : external(published('core', owner));
  },
});

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => {
    return {
      input: { [piece]: here(`./${entry}`) },
      platform: 'browser' as const,
      plugins: [publishedUrls(piece)],
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
         * **A map per piece, and it does not cost determinism.** These files are minified
         * framework code served from `/_fudic/`, so without one they are undebuggable in the
         * browser — which is where this framework runs. This said « no source map, it would
         * carry absolute paths »; it does not. Rolldown writes `sources` relative to the
         * output directory, in POSIX form (`../src/signal.ts`), and `sourcesContent` is the
         * file's own text. Nothing of the machine or the moment gets in, so §6.2 still holds:
         * building twice produces the same bytes, map included.
         *
         * A browser fetches a `.js.map` only when devtools is open, and the piece grows by the
         * `sourceMappingURL` line and nothing else.
         */
        sourcemap: true,
        comments: false,
      },
    };
  }),
);
