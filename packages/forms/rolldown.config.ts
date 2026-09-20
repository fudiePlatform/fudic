import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'rolldown';

/**
 * The published runtime of `@fudic/forms` (SDD-45 §3.3): one bundled, minified ES module per
 * piece, under `runtime/`, beside the `dist/` a bundler consumes. Same shape as
 * `packages/core/rolldown.config.ts`, and deliberately the same shape: a package that
 * publishes pieces its own way is a package the linker would have to know about.
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
  core: read(require.resolve('@fudic/core/package.json')).version,
};

/** `/_fudic/<version>/<pkg>/<piece>.js` — the one shape §3.1 publishes. */
const published = (pkg: string, piece: string): string =>
  `/_fudic/${versions[pkg] ?? version}/${pkg}/${piece}.js`;

/**
 * The pieces of this package, piece name → entry module.
 *
 * §4.3.1 takes the split from evidence and not from taste: these are the chunks an
 * application's rollup already emits for this package, i.e. the splits a real graph proved to
 * be optional — a form that binds a text input does not thereby bind a form element, and a
 * field with no length rule never names the validator.
 *
 * All of them are LIBRARY pieces (§3.4): nobody starts them, the chunk of whichever component
 * carries the form imports them, and they keep the names they export today. So this package
 * has no `bundle/` — a uniform entry here would be a ceremony invented for an
 * `import { bindText }`.
 *
 * `wiring` is the one name here that §4.3.1's table does not list, and it is in the list for
 * the second rule of §4.3 rather than for an opinion: see `FRONTIERS`.
 *
 * `delegation` and `length` get no piece: each is reached by exactly one of the above and
 * travels inside it. A module with one consumer is not given a frontier for symmetry.
 */
const PIECES: Readonly<Record<string, string>> = {
  'bind-form': 'src/dom/bind-form.ts',
  'bind-text': 'src/dom/bind-text.ts',
  wiring: 'src/dom/wiring.ts',
  'min-length': 'src/validators/min-length.ts',
  messages: 'src/messages.ts',
};

/**
 * The source modules that ARE a frontier: reaching one from another piece is an import that
 * must leave the bundle. Keyed by source module and not by piece, because that is how the
 * question arrives — `bind-text.ts` writes `./wiring.js`, not `wiring`.
 *
 * `wiring` is here and is not in §4.3.1's table, and the reason is the second rule of §4.3:
 * it is reached by `bind-form` — for `onSelf` and `undo` — AND by `bind-text`, for `bindErrors`
 * and `on`. Copying it would put the same bytes twice on the origin, which is exactly what
 * this SDD came to stop, so it becomes a piece and both sides declare it external. It is the
 * same case `core` hit twice with `registry` and `channel`.
 *
 * `messages` was already a piece and is reached by two of them — `bind-form` and `wiring` —
 * so the rule costs nothing there: it was going to be a frontier anyway.
 */
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/dom/bind-form.ts': 'bind-form',
  'src/dom/bind-text.ts': 'bind-text',
  'src/dom/wiring.ts': 'wiring',
  'src/validators/min-length.ts': 'min-length',
  'src/messages.ts': 'messages',
};

/** Absolute path → published URL, resolved once so the hook below is a lookup. */
const FRONTIER_URLS = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), published('forms', piece)]),
);

/**
 * The pieces of OTHER packages this one reaches.
 *
 * `@fudic/core` must never be inlined here: its `effect` piece is shared by every binder of
 * this package and by whatever else in the page is reactive, and a copy of it inside each
 * binder would be paid for by every app that has a form. The bare specifier resolves to one
 * piece because the pieces below import one thing from that package — `effect` — and the day
 * one of them imports `signal` as well this map stops being able to answer and has to become
 * per-export.
 */
const EXTERNAL_PACKAGES: Readonly<Record<string, string>> = {
  '@fudic/core': published('core', 'effect'),
};

/**
 * Rewrite every frontier import to its published URL.
 *
 * A plugin and not the `external` option because `external` only DECIDES; what is needed here
 * is a substitution — `'./wiring.js'`, which means nothing to a browser, has to come out as
 * `/_fudic/<version>/forms/wiring.js`. `'absolute'` keeps the URL exactly as written: with a
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
       * `import { type Control } from '../types.js'` into `import {} from '…'`, a bare import
       * that survives into the bundle and, once rewritten, becomes a REQUEST for a name that
       * only ever existed in the type system — and the worst kind of request, discovered
       * inside another piece, one round trip deep, which is the chain §1.5 rule 2 forbids.
       * `dist` keeps `verbatimModuleSyntax`, because there the statement is somebody else's
       * bundler's business; here the emit is the product.
       */
      transform: { typescript: { onlyRemoveTypeImports: false } },
      onLog(level, log, defaultHandler) {
        // Rolldown reports the override above as a conflict on every build. It is the one
        // conflict here that is deliberate, and a warning printed five times per build is how
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
