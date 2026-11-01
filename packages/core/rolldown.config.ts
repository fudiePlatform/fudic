import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { defineConfig, type Plugin } from 'rolldown';

// The published browser runtime: one bundled, minified module per piece under `runtime/`,
// fetched by URL. Bundled here rather than by each app so every app on an origin gets the
// same bytes and downloads them once per version. Every import between pieces leaves as an
// external URL, so no module lands in two pieces.

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

const read = (file: string): { version: string } =>
  JSON.parse(readFileSync(file, 'utf8')) as { version: string };

// The version in the URL is each package's own: two packages released apart must not
// point at each other's old files.
const require = createRequire(import.meta.url);
const { version } = read(here('./package.json'));
const versions: Readonly<Record<string, string>> = {
  dom: read(require.resolve('@fudic/dom/package.json')).version,
};

const published = (pkg: string, piece: string): string =>
  `/_fudic/${versions[pkg] ?? version}/${pkg}/${piece}.js`;

// Piece name → entry module. A module with a single consumer gets no piece and travels
// inside it. `strategy` has none: the compiler reads it and it never reaches a browser.
// `examples/pieces-bench/check.mjs` checks that no module is in two pieces and that every
// exported value has one.
const PIECES: Readonly<Record<string, string>> = {
  hydrate: 'bundle/hydrate.ts',
  'warm-sw': 'bundle/warm-sw.ts',
  'warm-preload': 'bundle/warm-preload.ts',
  parts: 'bundle/parts.ts',
  registry: 'src/hydrate/registry.ts',
  live: 'src/hydrate/live.ts',
  signal: 'bundle/signal.ts',
  tracking: 'src/tracking.ts',
  computed: 'src/computed.ts',
  effect: 'src/effect.ts',
  owner: 'src/owner.ts',
  task: 'src/task.ts',
  'route-data': 'src/route-data.ts',
  subscribe: 'src/subscribe.ts',
  element: 'src/element.ts',
};

// Source module → the piece that owns it. Importing one from another piece becomes an
// external URL. `registry` is shared by `hydrate` and `live`. `warm/channel.ts` is not a
// frontier although both warm channels use it: a page only ever loads one of them.
const FRONTIERS: Readonly<Record<string, string>> = {
  'src/hydrate/registry.ts': 'registry',
  'src/hydrate/live.ts': 'live',
  'src/signal.ts': 'signal',
  'src/batch.ts': 'signal',
  'src/now.ts': 'signal',
  'src/tracking.ts': 'tracking',
  'src/computed.ts': 'computed',
  'src/effect.ts': 'effect',
  'src/subscribe.ts': 'subscribe',
  'src/element.ts': 'element',
};

const FRONTIER_PIECES = new Map<string, string>(
  Object.entries(FRONTIERS).map(([file, piece]) => [here(`./${file}`), piece]),
);

// Pieces of other packages. `@fudic/dom` is never inlined: its `browser` piece is shared by
// every page on the origin.
const EXTERNAL_PACKAGES: Readonly<Record<string, string>> = {
  '@fudic/dom': published('dom', 'browser'),
};

// `'absolute'` keeps an origin-absolute URL as written instead of rewriting it as a path.
// No side effects: otherwise an unused external stays as a bare import, which is a request.
const external = (url: string) =>
  ({ id: url, external: 'absolute', moduleSideEffects: false }) as const;

// Rewrites every frontier import to its published URL.
const publishedUrls = (self: string): Plugin => ({
  name: 'fudic-published-urls',
  resolveId(source, importer) {
    const other = EXTERNAL_PACKAGES[source];
    if (other !== undefined) return external(other);
    if (importer === undefined || !source.startsWith('.')) return null;
    const file = fileURLToPath(new URL(source.replace(/\.js$/, '.ts'), pathToFileURL(importer)));
    const owner = FRONTIER_PIECES.get(file);
    // A module of the piece being built stays inside it.
    return owner === undefined || owner === self ? null : external(published('core', owner));
  },
});

export default defineConfig(
  Object.entries(PIECES).map(([piece, entry]) => {
    return {
      input: { [piece]: here(`./${entry}`) },
      platform: 'browser' as const,
      plugins: [publishedUrls(piece)],
      // Drops type-only imports. Under `verbatimModuleSyntax` they would survive as bare
      // imports and become requests for pieces that only exist in the type system.
      transform: { typescript: { onlyRemoveTypeImports: false } },
      onLog(level, log, defaultHandler) {
        // The override above is reported as a conflict on every build; it is deliberate.
        if (log.code === 'CONFIGURATION_FIELD_CONFLICT') return;
        defaultHandler(level, log);
      },
      output: {
        dir: 'runtime',
        format: 'esm' as const,
        // No hash: the version in the URL identifies the file.
        entryFileNames: '[name].js',
        minify: true,
        // Relative sources and the files' own text: the build stays deterministic.
        sourcemap: true,
        sourcemapIgnoreList: /conventions[\\/]dist[\\/]/u,
        comments: false,
      },
    };
  }),
);
