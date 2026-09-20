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
 * **Derived from what this package EXPORTS**, which is where the first split came up short:
 * it was read off the chunks an application's rollup emits, and `cursorOf` emits no chunk
 * because nothing in the runtime reaches it — the emitted code of a component does, and that
 * code does not exist until somebody compiles a `.fud`. So it had no URL, and an import of it
 * had nowhere to be rewritten to. `examples/pieces-bench/check.mjs` is what catches that now.
 *
 * Three frontiers, and each one is an axis a real page moves along: a page that paints does
 * not thereby dispatch bus events, and a component that walks the server's markup to attach
 * itself does not thereby paint.
 *
 * All LIBRARY pieces (§3.4): nobody starts them, whoever needs them imports them, and they
 * keep the names they export today. `browser` is entered from `bundle/` for the other reason —
 * to publish `NS` from the piece that already carries it.
 */
const PIECES: Readonly<Record<string, string>> = {
  browser: 'bundle/browser.ts',
  cursor: 'src/cursor.ts',
  emit: 'src/emit.ts',
};

/**
 * Source module → the piece that owns it. Reaching one from ANOTHER piece is an import that
 * must leave the bundle; reaching it from its own piece is not a frontier at all, which is
 * what lets `bundle/browser.ts` gather the adapter and the namespaces.
 *
 * Keyed by source module and not by piece, because that is how the question arrives — an
 * importer writes `./browser.js`, not `browser`.
 *
 * `ns` is owned by `browser` and is not a frontier: it is reached from there alone, and a
 * module with one consumer is not given a frontier for symmetry (§4.3.1). What it does need is
 * to be REACHABLE, which is the entry in `bundle/` and not this table. `dom.ts` is types only
 * and does not survive the transform.
 *
 * None of today's three pieces reaches another, so the crossing this table describes does not
 * happen yet. It is here because the rule is about the package's future and not its present:
 * the day `emit` needs the adapter, the import has to leave as a URL rather than put a second
 * copy of `browser` on the origin.
 */
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/browser.ts': 'browser',
  'src/ns.ts': 'browser',
  'src/cursor.ts': 'cursor',
  'src/emit.ts': 'emit',
};

/** Absolute path → the piece that owns it, resolved once so the hook below is a lookup. */
const FRONTIER_PIECES = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), piece]),
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
    const owner = FRONTIER_PIECES.get(file);
    // A module of the piece being built is not a frontier: `bundle/browser.ts` reaches the
    // adapter and the namespaces, and both belong to `browser`. A piece cannot import itself,
    // and the check that says so is about the PIECE and not about the entry file.
    return owner === undefined || owner === self
      ? null
      : // `moduleSideEffects: false` because a piece of this framework declares things and
        // starts nothing: without it a bundler keeps a bare `import "…"` for every external it
        // was offered and did not use, which is a request bought for nothing.
        ({ id: published('dom', owner), external: 'absolute', moduleSideEffects: false } as const);
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
