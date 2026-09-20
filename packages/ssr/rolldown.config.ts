import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'rolldown';

/**
 * The published runtime of `@fudic/ssr` (SDD-45 §3.3): one bundled, minified ES module per
 * piece, under `runtime/`, beside the `dist/` a bundler consumes. Same two products as in
 * `@fudic/core` — `dist` is source for somebody else's build, `runtime` is this framework's own
 * output, already compiled, that a consumer fetches by URL.
 *
 * **Who fetches it is the Service Worker, and only the Service Worker** (§4.3.1). A document
 * never renders; the worker does, and today it carries this renderer inlined so that a chunk
 * does not download it once per chunk. §4.10 changes the road and not the destination: the
 * worker asks its `Store` for `/_fudic/<version>/ssr/index.js`, links it with the linker it
 * already has, and puts it in `builtins` exactly as now. Producing that file is this config;
 * making the worker ask for it is phase 7 and is not here.
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

/**
 * A version comes from the `package.json` that owns it — never from an option and never from
 * `fudic.json` (§2, SDD-41). It is what makes a piece change, and therefore what identifies it.
 * This package's own version does not appear below: with a single piece and no frontier, the
 * only URL written here belongs to somebody else.
 */
const versionOf = (packageJson: string): string =>
  (JSON.parse(readFileSync(here(packageJson), 'utf8')) as { version: string }).version;

/** `/_fudic/<version>/<pkg>/<piece>.js` — the one shape §3.1 publishes. */
const published = (pkg: string, version: string, piece: string): string =>
  `/_fudic/${version}/${pkg}/${piece}.js`;

/**
 * The pieces of this package, piece name → entry module.
 *
 * ONE piece, named `index`, and both halves of that are §4.10 read literally: it names the URL
 * the worker will ask for, and it is a single file because this package has a single consumer
 * with a single need. The two rules of §4.3 ask of a frontier that it buy optionality or
 * sharing; between `serialize` and `tree` there is neither — the worker that renders one route
 * renders every route, and nothing else in the origin imports either — so splitting the
 * renderer would sell round trips for nothing.
 *
 * It is a LIBRARY piece (§3.4) and keeps exactly the names `src/index.ts` exports today, which
 * is what lets it enter `builtins` unchanged: the chunks the linker evaluates resolve
 * `@fudic/ssr` against that object and must not notice the move.
 */
const PIECES: Readonly<Record<string, string>> = {
  index: 'src/index.ts',
};

/**
 * What this package takes from `@fudic/di`, export by export, and which piece publishes it.
 *
 * Export by export and not package by package, because `@fudic/di` is not one piece: its
 * five values live in three (§4.3.1), and there is deliberately no `di/index` — a piece whose
 * whole content is re-exports would be a toll, and it could not hold `container` and `token`
 * without either duplicating them or declaring them external.
 *
 * `@fudic/di` must never be inlined here: a copy of the container tree inside the renderer
 * would put the same bytes twice on the origin, and worse, a second copy of the registry's
 * module state — a service enrolled in one copy is invisible to a resolution that went
 * through the other. The version in these URLs is DI's own, not this package's: they happen
 * to share a number today, and reading it from the wrong `package.json` would be right by
 * coincidence until the day they diverge.
 *
 * `@fudic/dom` is absent on purpose: everything this package takes from it — `Dom`, `Ns` — is a
 * type, so the import is erased below rather than rewritten, and a mapping for it would be an
 * entry that never answers.
 */
const DI_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  container: ['createChild', 'createRoot'],
  resolve: ['injectFrom'],
  seed: ['publishIn', 'seedOf'],
};

/** The id of the module that stands in for `@fudic/di`, and exists only during this build. */
const DI_SHIM = '\0fudic:di';

/**
 * Rewrite every cross-package import to its published URL.
 *
 * A plugin and not the `external` option because `external` only DECIDES; what is needed here
 * is a substitution — `'@fudic/di'`, which means nothing to a browser, has to come out as one
 * or more `/_fudic/<version>/di/*.js`.
 *
 * And a SHIM rather than a rename, because the source says `import { createChild } from
 * '@fudic/di'` while the answer is three different URLs: a `resolveId` hook is handed the
 * specifier and never the names, so it cannot split one import three ways. The shim can — it
 * re-exports each name from its own piece, rolldown inlines it, drops what this build does not
 * use, and what survives is one external import per piece actually reached. It costs no
 * request and no byte: nothing of it remains in the output but the imports themselves.
 *
 * `'absolute'` keeps each URL exactly as written: with a plain `true` an id starting with `/`
 * is read as a filesystem path and renormalized against the output directory, which would turn
 * an origin-absolute URL into `../../…`.
 */
const publishedUrls = (): Plugin => {
  const diVersion = versionOf('../di/package.json');
  return {
    name: 'fudic-published-urls',
    resolveId(source) {
      if (source === '@fudic/di') return DI_SHIM;
      // The pieces the shim names: already URLs, and they leave as they are.
      // `moduleSideEffects: false` because a piece of this framework declares things and
      // starts nothing. Without it the shim's three re-exports become three bare
      // `import "…"` whenever this build uses only some of them: requests bought for
      // nothing. It is true of every piece here, and saying so is what lets the shim shrink.
      return source.startsWith('/_fudic/')
        ? ({ id: source, external: 'absolute', moduleSideEffects: false } as const)
        : null;
    },
    load(id) {
      if (id !== DI_SHIM) return null;
      return Object.entries(DI_EXPORTS)
        .map(([piece, names]) => `export { ${names.join(', ')} } from '${published('di', diVersion, piece)}';`)
        .join('\n');
    },
  };
};

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => ({
    input: { [piece]: here(`./${entry}`) },
    platform: 'browser' as const,
    plugins: [publishedUrls()],
    /**
     * Erase a type-only import instead of leaving it as a side effect.
     *
     * `verbatimModuleSyntax` — which this repo requires and does not relax — turns
     * `import { type Dom } from '@fudic/dom'` into `import {} from '@fudic/dom'`, a bare import
     * that survives into the bundle and becomes a REQUEST for a package this renderer never
     * calls, discovered one round trip deep inside another piece. `dist` keeps
     * `verbatimModuleSyntax`, because there the statement is somebody else's bundler's
     * business; here the emit is the product.
     */
    transform: { typescript: { onlyRemoveTypeImports: false } },
    onLog(level, log, defaultHandler) {
      // Rolldown reports the override above as a conflict on every build. It is the one
      // conflict here that is deliberate, and a warning nobody can act on is a warning
      // everybody learns to skip.
      if (log.code === 'CONFIGURATION_FIELD_CONFLICT') return;
      defaultHandler(level, log);
    },
    output: {
      dir: 'runtime',
      format: 'esm' as const,
      // No hash: the version in the URL is the identity (§3.1), and a hash here would make the
      // name unpredictable to the plugin that has to write it into a coordinator.
      entryFileNames: '[name].js',
      minify: true,
      /**
       * The property everything else hangs on (§6.2): building twice produces the same bytes.
       * So nothing that varies with the machine or the moment may reach the output — no source
       * map (which would carry absolute paths), no banner, no legal comments.
       */
      sourcemap: false,
      comments: false,
    },
  })),
);
