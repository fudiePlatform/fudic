/**
 * The three checks of SDD-45 §6.5, over the files the framework actually publishes.
 *
 *   1. No module lands in two pieces        (§4.3, second rule)
 *   2. No exported value is left without a piece  (§4.3, fourth rule)
 *   3. No piece weighs less than its frontier     (§4.3, third rule)
 *
 * Plus the guard phase 1 needed and nobody wrote down: every import inside a published piece
 * has to resolve to a piece that exists. It is what caught `core/hydrate` pointing at a
 * `di/index` nobody published, and an agent reporting its own package green cannot see it.
 *
 * **Why these are derived and not read off a list.** The split is derived from what a package
 * EXPORTS, never from what an example spends — deducing it from an example is deducing it from
 * a coincidence, and that is how `minLength` got a piece and `required` did not. So:
 *
 * - **which modules are inside a piece** comes from building the real `rolldown.config.ts`
 *   with source maps into a temporary directory and reading each map's `sources`. The same
 *   config, the same plugins, the same frontiers — not a second walk of the import graph that
 *   would agree with the bundler until the day it did not.
 * - **which values a package exports** comes from its built `dist/`, where the type-only
 *   exports are already erased. `export { pattern } from './validators/pattern.js'` in
 *   `dist/index.js` is the question and its own answer: the name, and the module that owes it
 *   a piece.
 *
 * Exceptions live in EXCEPTIONS below, each with its reason. A deliberate one is three lines
 * of writing; a forgotten one is a 404 in somebody else's build.
 *
 * Usage:  node examples/pieces-bench/check.mjs [repo-root] [--json]
 *
 * `serve.mjs` imports `runChecks` and puts the same numbers at the top of the bench page,
 * because a check that only a terminal ever sees is a check somebody stops running.
 */
import { execFileSync } from 'node:child_process';
import { brotliCompressSync, constants } from 'node:zlib';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join, resolve, relative, dirname } from 'node:path';

/** What a frontier costs, compressed: §4.3, third rule. A piece under this loses money. */
const FRONTIER_BYTES = 150;

/**
 * The exceptions, each one written down because §4.3 says they are.
 *
 * `sharedModules` is the one relaxation of the second rule, and it only applies to pieces that
 * CANNOT COEXIST: if nobody can download both, the same bytes are never twice on the wire.
 *
 * `otherRealm` is the other relaxation, and it is not that one: these bytes ARE twice on the
 * origin, deliberately, because the two consumers cannot share a module system.
 *
 * `unpieced` are exported values with no published piece, and each entry says who does own
 * them. Most of them are `@fudic/transport`, which is inside the worker on purpose (§4.10).
 *
 * `underweight` are pieces below the frontier that stay anyway, for the two reasons §6.5
 * allows: they hold state that must not exist twice, or they have no siblings to go with.
 */
const EXCEPTIONS = {
  /** The uniform entry of a startup piece (§3.4). Every one of them exports this name. */
  startupName: 'install',
  sharedModules: [
    {
      module: 'packages/core/src/hydrate/warm/channel.ts',
      pieces: ['core/warm-preload', 'core/warm-sw'],
      why: 'The two warm channels are exclusive — an app has a Service Worker or it does not — so these bytes are never downloaded twice by anyone. As a piece it was 184 bytes paying a 150-byte frontier for a saving nobody could ever collect.',
    },
  ],
  /**
   * The renderer is the one published file that is not an ES module, and this is the price.
   *
   * A Service Worker may not `import()` — the specification forbids it in that scope — so it
   * evaluates what it downloads with `new Function(exports, require, module, …)`, the same path
   * it uses for every route chunk. An `import` statement inside that function body is a syntax
   * error, so the renderer is published as CommonJS, and it cannot require DI's pieces either:
   * those are ES modules, because documents import them. DI therefore travels INSIDE the
   * renderer, and its bytes are on the origin twice — once as pieces for documents, once in
   * here for the worker.
   *
   * ~2 kB, against ~6 kB taken out of every application's worker and out of every deploy of it.
   * And not a state hazard: a document and a worker are different realms and never shared a
   * module. Inside the worker's realm there is still one copy, because a route chunk requires
   * `@fudic/ssr` and never `@fudic/di`.
   */
  otherRealm: {
    piece: 'ssr/index',
    modules: /^packages\/di\/src\//,
    why: '§4.10: the worker cannot import, so the renderer it links is CommonJS with `@fudic/di` inside it. Documents import DI as pieces; the worker cannot. Two realms, two module systems, and the bytes twice on the origin is the price.',
  },
  unpieced: [
    {
      match: /^@fudic\/transport:(?!.*\/urls\.ts$)/,
      why: '§4.10: `@fudic/transport` is bundled inside the Service Worker, which is the thing that opens the cache and links — it cannot fetch itself by the path it implements. Only `urls` is published, for the coordinator.',
    },
    {
      match: /:src\/index\.ts:VERSION$/,
      why: 'The package version constant. Nothing in a browser reads it; it exists for whoever inspects the package.',
    },
    {
      match: /^@fudic\/core:src\/strategy\.ts:/,
      why: 'A route strategy is a build-time declaration the compiler reads out of the source. It never reaches a browser.',
    },
    {
      match: /^@fudic\/core:src\/hydrate\/(maps|cells)\.ts:/,
      why: 'The six block ids and the cell-marker predicate: the exception §4.3 names, constants the emit consumes. They are inside `core/hydrate` already, but naming them as exports keeps their identifiers from the minifier and costs 167 bytes on the one piece every hydrating page downloads. If a component ever imports one, the linker has no URL and says so in the build.',
    },
    {
      match: /^@fudic\/ssr:/,
      why: '§4.10: the renderer is one piece, `ssr/index`, and only the Service Worker asks for it — it enters `builtins` under the names `src/index.ts` exports, resolved by the linker the worker already has and never by a URL a browser writes.',
    },
  ],
  underweight: [
    { piece: 'dom/emit', why: 'No siblings: `@fudic/dom` publishes an adapter, a hydration walk and this, and none of the three is an alternative to another — whoever paints is not thereby whoever dispatches.' },
    { piece: 'di/token', why: 'No siblings, and identity IS the object: a second copy would be a second set of tokens that compare unequal to the first.' },
    { piece: 'di/seed', why: 'Holds the table a page publishes, hung off the root container. Merging it into a sibling would drag that sibling into every route that seeds.' },
    { piece: 'forms/messages', why: 'Holds state: the message map an application sets once. Two copies would be two maps, and the second binder would render the default text.' },
    { piece: 'forms/server-flag', why: 'Holds state, and it is the whole module: the `Symbol` that marks a rule server-only. Two copies and a rule marked through one runs on the client, because the other does not recognise the mark. Reached by `control` and by `serverValidator`.' },
    { piece: 'forms/run-rule', why: 'No siblings: it is the one line that calls a rule, reached by `control` and by `form`, and it belongs to neither. Forty-five bytes, and the second rule of §4.3 forbids the alternative — a copy in each would be the same bytes twice on the origin.' },
  ],
};

const read = (file) => readFileSync(file, 'utf8');
const readJson = (file) => JSON.parse(read(file));
const posix = (p) => p.split('\\').join('/');
const brotli = (text) =>
  brotliCompressSync(Buffer.from(text), {
    params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
  }).length;

/** The packages that declare `fudic.runtime`. Nobody is enumerated: §3.3 is a requirement. */
const publishers = (ROOT) =>
  readdirSync(join(ROOT, 'packages'))
    .map((dir) => join(ROOT, 'packages', dir, 'package.json'))
    .filter((file) => existsSync(file))
    .map((file) => ({ dir: dirname(file), json: readJson(file) }))
    .filter((p) => p.json.fudic?.runtime !== undefined)
    .map((p) => ({ ...p, name: p.json.name, short: p.json.name.replace('@fudic/', '') }));

/**
 * Module → piece, from a source-mapped build of the package's own config.
 *
 * The published output carries no source map on purpose (§6.2: the same bytes twice, and a map
 * would carry absolute paths), so this builds the same config again into a temporary directory
 * with `-s`. It is the real bundler answering, which is the only answer worth checking.
 */
const modulesOf = (pkg, ROOT) => {
  const require = createRequire(join(pkg.dir, 'package.json'));
  const cli = join(dirname(require.resolve('rolldown/package.json')), 'bin/cli.mjs');
  const out = mkdtempSync(join(tmpdir(), 'fudic-pieces-'));
  try {
    execFileSync(process.execPath, [cli, '-c', join(pkg.dir, 'rolldown.config.ts'), '-d', out, '-s'], {
      cwd: pkg.dir,
      stdio: 'pipe',
    });
    const byPiece = new Map();
    for (const file of readdirSync(out)) {
      if (!file.endsWith('.js.map')) continue;
      const piece = `${pkg.short}/${file.slice(0, -'.js.map'.length)}`;
      const sources = readJson(join(out, file)).sources.map((s) =>
        posix(relative(ROOT, resolve(out, s))),
      );
      byPiece.set(piece, sources);
    }
    return byPiece;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
};

/**
 * The value exports of a package, from its `dist/`: `{ name, module }` per exported value.
 *
 * `dist` and not `src` because the compiler has already erased the type-only exports, and a
 * type owes nobody a piece. Every entry point the `exports` field declares is walked, which is
 * how `@fudic/forms/dom` — six binders that the first split never saw — gets asked about.
 */
const exportsOf = (pkg) => {
  const entries = Object.entries(pkg.json.exports ?? {})
    .map(([, target]) => (typeof target === 'string' ? target : target.import))
    .filter((target) => target?.endsWith('.js'));

  const found = [];
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file) || !existsSync(file)) return;
    seen.add(file);
    const code = read(file);
    const self = posix(relative(pkg.dir, file)).replace(/^dist\//, 'src/').replace(/\.js$/, '.ts');

    // `export { a, b as c } from './x.js'` — the name, and the module that owes it a piece.
    for (const m of code.matchAll(/export\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
      const from = resolve(dirname(file), m[2]);
      const target = posix(relative(pkg.dir, from)).replace(/^dist\//, 'src/').replace(/\.js$/, '.ts');
      for (const name of names(m[1])) found.push({ name, module: target });
    }
    // `export * from './x.js'` — follow it, the names are over there.
    for (const m of code.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
      visit(resolve(dirname(file), m[1]));
    }
    // Declared right here: `export const VERSION`, `export function x`, `export class Y`.
    for (const m of code.matchAll(
      /export\s+(?:declare\s+)?(?:const|let|var|function\*?|async\s+function\*?|class)\s+([A-Za-z_$][\w$]*)/g,
    )) {
      found.push({ name: m[1], module: self });
    }
  };
  for (const entry of entries) visit(resolve(pkg.dir, entry));
  return found;
};

/** `a, b as c,` → the names a consumer can import. Empty braces are a type-only export. */
const names = (list) =>
  list
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .map((part) => {
      const as = part.split(/\s+as\s+/);
      return (as[1] ?? as[0]).trim();
    })
    .filter((name) => name !== 'type');

/** What is published today: piece → its bytes, raw and compressed, and its imports. */
const publishedOf = (pkg) => {
  const dir = join(pkg.dir, pkg.json.fudic.runtime);
  const version = pkg.json.version;
  const out = new Map();
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const body = read(join(dir, file));
    const name = file.slice(0, -3);
    out.set(`${pkg.short}/${name}`, {
      url: `/_fudic/${version}/${pkg.short}/${name}.js`,
      bytes: Buffer.byteLength(body),
      compressed: brotli(body),
      // Static and DYNAMIC, and the three quotes: a piece that asks for another one at the
      // moment it needs it writes `import(`…`)`, which is how the pieces §4.4.1 took out of
      // the load arrive. A URL that does not exist is the same 404 whichever form names it.
      imports: [
        ...body.matchAll(
          /from\s*["'`]([^"'`]+)["'`]|import\s*\(?\s*["'`]([^"'`]+)["'`]/g,
        ),
      ].map((m) => m[1] ?? m[2]),
      // What a consumer can actually import from this URL. Being INSIDE a piece is not
      // enough: `batch` travelled inside `core/signal` and was reachable from nowhere, which
      // is a 404 that waits until somebody writes `import { batch }`.
      exports: [...body.matchAll(/export\s*\{([^}]*)\}\s*(?!from)[;\n]/g)].flatMap((m) =>
        names(m[1]),
      ),
    });
  }
  return out;
};

/** The three checks and the guard, over the repository at `root`. */
export const runChecks = (root = '.') => {
  const ROOT = resolve(root);
  const pkgs = publishers(ROOT);
  const modules = new Map(); // module → [piece]
  const published = new Map(); // piece → facts
  const exported = []; // { pkg, name, module }

  for (const pkg of pkgs) {
    for (const [piece, sources] of modulesOf(pkg, ROOT)) {
      for (const source of sources) {
        if (!modules.has(source)) modules.set(source, []);
        modules.get(source).push(piece);
      }
    }
    for (const [piece, facts] of publishedOf(pkg)) published.set(piece, facts);
    for (const e of exportsOf(pkg)) exported.push({ pkg: pkg.name, ...e });
  }

  /** Which piece holds a module, for the export check. */
  const pieceOf = new Map();
  for (const [module, pieces] of modules) pieceOf.set(module, pieces);

  // 1. No module in two pieces.
  const shared = [];
  for (const [module, pieces] of modules) {
    if (pieces.length < 2) continue;
    const realm = EXCEPTIONS.otherRealm;
    // The worker's copy: this module is in ITS piece and in the renderer, and nowhere else.
    if (
      pieces.length === 2 &&
      pieces.includes(realm.piece) &&
      realm.modules.test(module)
    ) {
      continue;
    }
    const allowed = EXCEPTIONS.sharedModules.find(
      (e) => e.module === module && [...pieces].sort().join() === [...e.pieces].sort().join(),
    );
    if (allowed === undefined) shared.push({ module, pieces: [...pieces].sort() });
  }

  // 2. No exported value without a piece — and "with a piece" means a URL a consumer can
  //    import the name FROM, not merely a bundle the bytes ended up inside.
  const providers = new Map(); // exported name (pkg-qualified) → [piece]
  for (const [piece, facts] of published) {
    const pkg = piece.split('/')[0];
    for (const name of facts.exports) {
      const key = `${pkg}:${name}`;
      if (!providers.has(key)) providers.set(key, []);
      providers.get(key).push(piece);
    }
  }
  const orphans = [];
  for (const e of exported) {
    const short = e.pkg.replace('@fudic/', '');
    if ((providers.get(`${short}:${e.name}`) ?? []).length > 0) continue;
    if (EXCEPTIONS.unpieced.some((x) => x.match.test(`${e.pkg}:${e.module}:${e.name}`))) continue;
    orphans.push({ name: e.name, module: e.module, pkg: e.pkg });
  }
  // The other half of the same rule: and to ONE piece only. Two URLs offering the same name
  // are two copies of it on the origin, which is what this SDD came to stop.
  for (const [key, pieces] of providers) {
    if (pieces.length < 2) continue;
    // Every startup piece exports the same name on purpose (§3.4), so that a new package can
    // be added without the coordinator's generator learning about it.
    if (key.endsWith(`:${EXCEPTIONS.startupName}`)) continue;
    const allowed = EXCEPTIONS.sharedModules.some(
      (e) => [...pieces].sort().join() === [...e.pieces].sort().join(),
    );
    if (!allowed) shared.push({ export: key, pieces: [...pieces].sort() });
  }

  // 3. No piece below its frontier.
  const light = [];
  for (const [piece, facts] of published) {
    if (facts.compressed >= FRONTIER_BYTES) continue;
    if (EXCEPTIONS.underweight.some((x) => x.piece === piece)) continue;
    light.push({ piece, compressed: facts.compressed, bytes: facts.bytes });
  }

  // 4. The guard: every import inside a piece resolves to a piece that exists.
  const urls = new Set([...published.values()].map((f) => f.url));
  const broken = [];
  for (const [piece, facts] of published) {
    for (const spec of facts.imports) {
      if (!spec.startsWith('/_fudic/')) continue;
      if (!urls.has(spec)) broken.push({ piece, spec });
    }
  }

  /**
   * An exception nobody needs any more.
   *
   * Written exceptions are how this file stays honest, and a stale one is the opposite: it
   * silently permits something nobody decided to permit. `forms/internals` was on the
   * underweight list for one build and then grew past the frontier, and nothing would have
   * said so. It does not fail the run — deleting a line is not urgent — but it is printed.
   */
  const stale = [
    ...EXCEPTIONS.underweight
      .filter((e) => (published.get(e.piece)?.compressed ?? 0) >= FRONTIER_BYTES)
      .map((e) => `underweight: ${e.piece} now clears the frontier`),
    ...EXCEPTIONS.sharedModules
      .filter((e) => (modules.get(e.module) ?? []).length < 2)
      .map((e) => `sharedModules: ${e.module} is no longer in two pieces`),
    // The day the renderer stops carrying DI — because a worker can import, or because it
    // stopped needing injection — this permission outlives its reason and says so.
    ...([...modules].some(
      ([module, pieces]) =>
        pieces.includes(EXCEPTIONS.otherRealm.piece) && EXCEPTIONS.otherRealm.modules.test(module),
    )
      ? []
      : [`otherRealm: ${EXCEPTIONS.otherRealm.piece} no longer carries a copy of anybody`]),
  ];

  return {
    pieces: published.size,
    stale,
    bytes: [...published.values()].reduce((a, f) => a + f.bytes, 0),
    compressed: [...published.values()].reduce((a, f) => a + f.compressed, 0),
    exports: exported.length,
    checks: [
      { id: 'shared', title: 'Ningún módulo en dos piezas', failures: shared },
      { id: 'orphans', title: 'Ningún valor exportado sin pieza', failures: orphans },
      { id: 'light', title: 'Ninguna pieza por debajo de su frontera', failures: light },
      { id: 'broken', title: 'Ningún import a una pieza que no existe', failures: broken },
    ],
    table: [...published]
      .map(([piece, f]) => ({ piece, bytes: f.bytes, compressed: f.compressed }))
      .sort((a, b) => b.compressed - a.compressed),
  };
};

// Run directly, it is a command; imported by `serve.mjs`, it is a function. The published
// pieces are read the same way either way.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const report = runChecks(args.find((a) => !a.startsWith('--')) ?? '.');

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `${report.pieces} pieces · ${report.bytes} bytes · ${report.compressed} compressed · ${report.exports} exported values\n`,
    );
    for (const check of report.checks) {
      console.log(
        `${check.failures.length === 0 ? 'OK  ' : 'FAIL'} ${check.title}: ${check.failures.length}`,
      );
      for (const f of check.failures) console.log(`       ${JSON.stringify(f)}`);
    }
    for (const s of report.stale) console.log(`NOTE stale exception — ${s}`);
    process.exitCode = report.checks.every((c) => c.failures.length === 0) ? 0 : 1;
  }
}
