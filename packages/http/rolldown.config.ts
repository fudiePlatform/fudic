import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'rolldown';

/**
 * The published runtime of `@fudic/http` (BUG-57, SDD-45 §3.3): one bundled, minified ES module
 * per piece, under `runtime/`, beside the `dist/` a bundler consumes. Same shape as
 * `packages/forms/rolldown.config.ts`, and deliberately the same shape: a package that publishes
 * pieces its own way is a package the linker would have to know about.
 *
 * Before this, `@fudic/http` was bundled into every application, and what it takes from
 * `@fudic/conventions` — the prefixes of the endpoints, the name of the stale-data notice —
 * came out as a chunk of its own, a request per page for a few hundred bytes. Inside a piece
 * those constants are inlined, and the client is downloaded once per origin.
 */

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const read = (file: string): { version: string } =>
  JSON.parse(readFileSync(file, 'utf8')) as { version: string };

/**
 * The version comes from the `package.json`, which owns it (§2, SDD-41). A piece of ANOTHER
 * package is named with THAT package's version, read through the `./package.json` export every
 * publishing package declares: a URL that is right by luck is a 404 the day somebody releases
 * one package without the other.
 */
const require = createRequire(import.meta.url);
const { version } = read(here('./package.json'));
const versions: Readonly<Record<string, string>> = {
  forms: read(require.resolve('@fudic/forms/package.json')).version,
};

/** `/_fudic/<version>/<pkg>/<piece>.js` — the one shape §3.1 publishes. */
const published = (pkg: string, piece: string): string =>
  `/_fudic/${versions[pkg] ?? version}/${pkg}/${piece}.js`;

/**
 * The pieces of this package, piece name → entry module.
 *
 * **Two, and the frontier is the format.** Every page that calls its server needs the stubs,
 * the errors and the binary format, which is what a function speaks unless its chain says
 * `use json`; that is `contract`. JSON is the exception a few functions opt into, so it is a
 * piece of its own and a page none of whose functions speak it never downloads it.
 *
 * Both are LIBRARY pieces (§3.4): nobody starts them, the module generated from a `.fudapi`
 * imports them and they keep the names they export today.
 */
const PIECES: Readonly<Record<string, string>> = {
  contract: 'bundle/contract.ts',
  json: 'src/wire/json.ts',
};

/**
 * Source module → the piece that owns it. Reaching one from ANOTHER piece is an import that must
 * leave the bundle (§4.3, second rule): `json` takes `conform` and `badRequest` from `contract`,
 * and a copy inside `json` would be a second `HttpError` class that `instanceof` does not
 * recognise.
 */
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/contract/wire.ts': 'contract',
  'src/errors.ts': 'contract',
};

/** Absolute path → the piece that owns it, resolved once so the hook below is a lookup. */
const FRONTIER_PIECES = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), piece]),
);

/**
 * What this package takes from `@fudic/forms/contract`, and which piece publishes it: the
 * registry slot an implementation fills and the turn a loading file waits for. Never inlined —
 * a second registry is one the implementations would never fill.
 */
const FORMS_EXPORTS: Readonly<Record<string, readonly string[]>> = {
  contract: ['Slot', 'settled', 'folderOf', 'inTurn', 'loadingFile', 'resetRegistry', 'setFolders', 'takeRefusal'],
};

/** The id of the module that stands in for `@fudic/forms/contract`, only during this build. */
const FORMS_SHIM = '\0fudic:forms-contract';

/**
 * A published piece, leaving as a URL and declared free of side effects: `'absolute'` keeps the
 * URL exactly as written, and a piece of this framework declares things and starts nothing.
 */
const external = (url: string) =>
  ({ id: url, external: 'absolute', moduleSideEffects: false }) as const;

/**
 * Rewrite every frontier import to its published URL, and `@fudic/forms/contract` to the piece
 * that publishes each name it gives — the same device `packages/forms/rolldown.config.ts` uses
 * for `@fudic/core`. `@fudic/conventions` is not here on purpose: it is constants, and inlining
 * them is the point.
 */
const publishedUrls = (self: string): Plugin => ({
  name: 'fudic-published-urls',
  resolveId(source, importer) {
    if (source === '@fudic/forms/contract') return FORMS_SHIM;
    if (source.startsWith('/_fudic/')) return external(source);
    if (importer === undefined || !source.startsWith('.')) return null;
    const file = fileURLToPath(new URL(source.replace(/\.js$/, '.ts'), pathToFileURL(importer)));
    const owner = FRONTIER_PIECES.get(file);
    return owner === undefined || owner === self ? null : external(published('http', owner));
  },
  load(id) {
    if (id !== FORMS_SHIM) return null;
    return Object.entries(FORMS_EXPORTS)
      .map(([piece, names]) => `export { ${names.join(', ')} } from '${published('forms', piece)}';`)
      .join('\n');
  },
});

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => ({
    input: { [piece]: here(`./${entry}`) },
    platform: 'browser' as const,
    plugins: [publishedUrls(piece)],
    // Erase a type-only import instead of leaving it as a side effect: under
    // `verbatimModuleSyntax` it would survive as a bare import, and here the emit is the product.
    transform: { typescript: { onlyRemoveTypeImports: false } },
    onLog(level, log, defaultHandler) {
      // The override above, reported as a conflict on every build: the one that is deliberate.
      if (log.code === 'CONFIGURATION_FIELD_CONFLICT') return;
      defaultHandler(level, log);
    },
    output: {
      dir: 'runtime',
      format: 'esm' as const,
      // No hash: the version in the URL is the identity (§3.1).
      entryFileNames: '[name].js',
      minify: true,
      // A map per piece: minified framework code is undebuggable in the browser without one.
      sourcemap: true,
      comments: false,
    },
  })),
);
