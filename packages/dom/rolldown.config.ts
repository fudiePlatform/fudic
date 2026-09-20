import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'rolldown';

/**
 * The published runtime of `@fudic/dom` (SDD-45 §3.3): one bundled, minified ES module per
 * piece, under `runtime/`, beside the `dist/` a bundler consumes. Same shape as
 * `packages/core/rolldown.config.ts`, and deliberately the same shape: a package that
 * publishes pieces its own way is a package the linker would have to know about.
 *
 * `browser` is the piece every fudic page in the origin ends up naming — it is what
 * `core/hydrate` imports rather than inlines — so it is bundled here, once per version, and
 * never copied into whoever reaches it (§4.3, second rule).
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
 * §4.3.1 takes the split from evidence and not from taste: these are the two chunks an
 * application's rollup already emits for this package, i.e. the two frontiers a real graph
 * proved to be optional — a page that paints does not thereby dispatch bus events, and a
 * component that dispatches them may render nothing itself.
 *
 * Both are LIBRARY pieces (§3.4): nobody starts them, whoever needs them imports them, and
 * they keep the names they export today. So neither has an entry in `bundle/`, and this
 * package has no `bundle/` at all.
 *
 * `ns` and `dom` get no piece: `ns` is reached by `browser` alone and travels inside it, and
 * `dom` is types only and does not survive the transform. A module with one consumer is not
 * given a frontier for symmetry (§4.3.1).
 */
const PIECES: Readonly<Record<string, string>> = {
  browser: 'src/browser.ts',
  emit: 'src/emit.ts',
};

/**
 * The source modules that ARE a frontier: reaching one from another piece is an import that
 * must leave the bundle. Keyed by source module and not by piece, because that is how the
 * question arrives — an importer writes `./browser.js`, not `browser`.
 *
 * Neither of today's two pieces reaches the other, so the map is declared and not exercised.
 * It is here because the rule it enforces is about the package's future and not its present:
 * the day `emit` needs the adapter, the import has to leave as a URL rather than put a second
 * copy of `browser` on the origin.
 */
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/browser.ts': 'browser',
  'src/emit.ts': 'emit',
};

/** Absolute path → published URL, resolved once so the hook below is a lookup. */
const FRONTIER_URLS = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), published('dom', piece)]),
);

/**
 * Rewrite every frontier import to its published URL.
 *
 * A plugin and not the `external` option because `external` only DECIDES; what is needed here
 * is a substitution — `'./browser.js'`, which means nothing to a browser, has to come out as
 * `/_fudic/<version>/dom/browser.js`. `'absolute'` keeps the URL exactly as written: with a
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
       * `import { type DomClient } from './dom.js'` into `import {} from '…'`, a bare import
       * that survives into the bundle and, once rewritten, becomes a REQUEST for a name that
       * only ever existed in the type system — and the worst kind of request, discovered
       * inside another piece, one round trip deep, which is the chain §1.5 rule 2 forbids.
       * `dist` keeps `verbatimModuleSyntax`, because there the statement is somebody else's
       * bundler's business; here the emit is the product.
       */
      transform: { typescript: { onlyRemoveTypeImports: false } },
      onLog(level, log, defaultHandler) {
        // Rolldown reports the override above as a conflict on every build. It is the one
        // conflict here that is deliberate, and a warning printed twice per build is how
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
