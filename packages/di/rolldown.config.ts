import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'rolldown';

/**
 * The published runtime of `@fudic/di` (SDD-45 §3.3): one bundled, minified ES module per
 * piece, under `runtime/`, beside the `dist/` a bundler consumes. Same shape as
 * `packages/core/rolldown.config.ts`, and deliberately the same shape: a package that
 * publishes pieces its own way is a package the linker would have to know about.
 *
 * Every cross-piece import leaves as an `external` pointing at the published URL, so a piece
 * is a closed box with nothing to discover inside it (§4.3) and no module lands in two of
 * them (§4.3, second rule).
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * The version comes from the `package.json`, which owns it — never from an option and never
 * from `fudic.json` (§2, SDD-41). It is what makes these files change, and therefore what
 * identifies them.
 */
const { version } = JSON.parse(readFileSync(here('./package.json'), 'utf8')) as {
  version: string;
};

/** `/_fudic/<version>/<pkg>/<piece>.js` — the one shape §3.1 publishes. */
const published = (pkg: string, piece: string): string => `/_fudic/${version}/${pkg}/${piece}.js`;

/**
 * The pieces of this package, piece name → entry module.
 *
 * §4.3.1 takes the split from evidence and not from taste: these are the chunks an
 * application's rollup already emits for this package, i.e. the splits a real graph proved to
 * be either optional or shared. A route without providers never names `page`; a route that
 * injects by class never names `token`.
 *
 * `page` is a STARTUP piece (§3.4) — the coordinator builds the tree before the first
 * component wakes up — and its entry lives in `bundle/`, where the uniform `install` name is
 * added without `dist` or the coverage denominator of `src/**` growing a module nobody wrote.
 * The rest are library pieces and keep the names they export today.
 *
 * `registry`, `resolve` and `seed` are here and are not in §4.3.1's table, for the reason
 * §4.3.1 gives its own list: the table records the chunks an APPLICATION's build emits, and an
 * application reaches this package through `@fudic/di`, whose specifier its bundler resolves
 * and inlines. The published side has no such luxury — an import that leaves a piece has to
 * name a URL, and a URL only exists where a piece does. `@fudic/ssr` links `injectFrom`,
 * `publishIn` and `seedOf`, and a component's own chunk reaches `provide`, `provideIn` and
 * `Service`, so those three modules are reached from OUTSIDE this package and inlining them
 * would put the same bytes on the origin once per consumer (§4.3, second rule).
 *
 * The invariant this list keeps, and the one to check when adding to it: every value
 * `src/index.ts` exports is reachable from exactly one of these pieces.
 *
 * There is deliberately no `index` piece. It would carry `container` and `token`, which are
 * pieces already, so it would either duplicate them or declare them external and consist of
 * nothing but re-exports — a frontier that buys neither optionality nor sharing, which is the
 * definition of a toll (§4.3).
 */
const PIECES: Readonly<Record<string, string>> = {
  page: 'bundle/page.ts',
  container: 'src/container.ts',
  token: 'src/token.ts',
  registry: 'src/registry.ts',
  resolve: 'src/resolve.ts',
  seed: 'src/seed.ts',
};

/**
 * The source modules that ARE a frontier: reaching one from another piece is an import that
 * must leave the bundle. Keyed by source module and not by piece, because that is how the
 * question arrives — `page.ts` writes `./container.js`, not `container`.
 *
 * `container` is the one every other piece here crosses — `page`, `registry`, `resolve` and
 * `seed` all reach `state` or `rootOf` — and it is the clearest case in the package for the
 * second rule of §4.3: four copies of the container's module state would not merely waste
 * bytes, they would be four registries, and a service provided through one would be invisible
 * to a resolution that went through another.
 *
 * `page` is absent on purpose: nothing imports a startup piece, the coordinator CALLS it.
 */
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/container.ts': 'container',
  'src/token.ts': 'token',
  'src/registry.ts': 'registry',
  'src/resolve.ts': 'resolve',
  'src/seed.ts': 'seed',
};

/** Absolute path → published URL, resolved once so the hook below is a lookup. */
const FRONTIER_URLS = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), published('di', piece)]),
);

/**
 * Rewrite every frontier import to its published URL.
 *
 * A plugin and not the `external` option because `external` only DECIDES; what is needed here
 * is a substitution — `'./container.js'`, which means nothing to a browser, has to come out as
 * `/_fudic/<version>/di/container.js`. `'absolute'` keeps the URL exactly as written: with a
 * plain `true` an id starting with `/` is read as a filesystem path and renormalized against
 * the output directory, which would turn an origin-absolute URL into `../../…`.
 */
const publishedUrls = (self: string): Plugin => ({
  name: 'fudic-published-urls',
  resolveId(source, importer) {
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
       * `import { type Container } from './types.js'` into `import {} from '…'`, a bare import
       * that survives into the bundle and, once rewritten, becomes a REQUEST for a name that
       * only ever existed in the type system — and the worst kind of request, discovered
       * inside another piece, one round trip deep, which is the chain §1.5 rule 2 forbids.
       * It is also what keeps `@fudic/core` out of `page`: the piece names it for
       * `RuntimeEntry` and for nothing else, and nothing of another package may be inlined.
       * `dist` keeps `verbatimModuleSyntax`, because there the statement is somebody else's
       * bundler's business; here the emit is the product.
       */
      transform: { typescript: { onlyRemoveTypeImports: false } },
      onLog(level, log, defaultHandler) {
        // Rolldown reports the override above as a conflict on every build. It is the one
        // conflict here that is deliberate, and a warning printed six times per build is how
        // everybody learns to stop reading the ones that are not.
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
