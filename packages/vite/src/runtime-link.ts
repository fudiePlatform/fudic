/**
 * Linking the published runtime instead of bundling it (SDD-45 §4.2).
 *
 * `runtime-pieces.ts` answers «which pieces exist». This module answers the three questions
 * that follow, and it is the whole of the change: which URL a name resolves to, which pieces
 * this build actually reached, and what has to be copied into the output.
 *
 * **Why a shim and not `external`.** The build says `import { signal, effect } from
 * '@fudic/core'` and the answer is TWO URLs. A resolver is handed the specifier and never the
 * names, so it cannot split one import two ways. The shim can: a module that re-exports each
 * published name from its own piece, which the bundler inlines and prunes, leaving one
 * external import per piece actually reached and not a byte of itself. It is the same device
 * `@fudic/ssr` and `@fudic/forms` use in their own configs, for the same reason.
 *
 * **Why the shim starts with `export *`.** Not everything a runtime package exports is
 * published: `@fudic/transport` lives inside the Service Worker on purpose (§4.10) and only
 * `urls` has a URL. A star re-export of the real module, shadowed by the explicit ones,
 * means link what is published and bundle what is not — with no second list of names to keep
 * in step, and with the bundler dropping the star entirely when nothing needs it.
 *
 * **Which name lives in which piece is read off the published files themselves.** Not from a
 * table here, not from a manifest the publisher would have to keep in step: the export list of
 * `core/signal.js` IS the contract a browser can hold it to, and anything else is a second
 * declaration that drifts. It is also what makes §3.3 true — `@fudic/http` publishes by
 * declaring a directory, and nobody edits this file.
 *
 * Nothing here throws. A package whose runtime was never built, two packages claiming one URL
 * and a piece carrying the application inside it are diagnostics (`FUD0801`, `FUD0802`,
 * `FUD0806`), because a build that stops with a stack trace is a build nobody can read.
 */

import { BUILD_TOKEN } from './constants.js';
import {
  FUD_RUNTIME_PIECE_DIFFERS,
  FUD_RUNTIME_PIECE_HAS_BUILD,
  type FudicDiagnostic,
} from './diagnostics.js';
import { type RuntimePiece } from './runtime-pieces.js';

/** What linking needs of the world: the text of a file, if it is there. */
export interface RuntimeLinkIo {
  readFile(path: string): string | undefined;
}

/** A published piece and the names a consumer can import from its URL. */
export interface LinkedPiece extends RuntimePiece {
  /** The names its `export { … }` offers, which is what the shim can answer with. */
  readonly exports: readonly string[];
  /** Its bytes, read once: they are what gets copied, and what `FUD0806` is asked about. */
  readonly code: string;
}

/** Every piece this build can link, indexed the three ways the plugin asks. */
export interface RuntimeLinkage {
  /** Package name → export name → the URL that offers it. */
  readonly urlOf: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** URL → the piece behind it. */
  readonly byUrl: ReadonlyMap<string, LinkedPiece>;
  /** The packages whose specifiers are rewritten. Never a list written by hand (§3.3). */
  readonly packages: readonly string[];
  /** Where each publisher lives, for the question `insidePublisher` asks. */
  readonly roots: readonly string[];
}

/** The id under which a package's shim is resolved, one per specifier AND per importer. */
export const RUNTIME_SHIM = '\0fudic:runtime:';

/**
 * A shim id, which carries the importer, and that is the whole reason it does.
 *
 * With one shim per specifier the bundler did the obvious thing: a module a dozen component
 * chunks import is a SHARED chunk, so the build grew `assets/core-<id>.js` whose entire
 * content was `import { signal } from '/_fudic/…/core/signal.js'; export { signal }`. That is
 * a request bought for nothing, and worse than nothing — the piece URLs then sit one round
 * trip deep, discovered inside a chunk instead of named by the importer, which is the
 * discovery chain §1.5 rule 2 exists to forbid.
 *
 * Per importer, no module is shared, so each one is inlined into whoever asked; what is left
 * after tree-shaking is the external imports themselves, in the importer's own chunk, and not
 * a byte of the shim. The real module behind the star is still shared when several importers
 * reach it — which is correct: that part really is bundled.
 *
 * The SPECIFIER goes last, and that is not arrangement: the importer ends in
 * `…/app-card.fud?client`, and an id ending that way is a `.fud` to every hook that asks what
 * a file is. Sixty of them tried to compile `@fudic/core`.
 */
export function shimIdFor(source: string, importer: string | undefined): string {
  return `${RUNTIME_SHIM}${importer ?? ''}\u0000${source}`;
}

/** The specifier a shim id stands for. */
export function shimSpecifier(id: string): string {
  const parts = id.split('\u0000');
  return parts[parts.length - 1] ?? '';
}

/**
 * A name exported by two pieces of one package cannot be answered, so it is not offered.
 *
 * It happens once and on purpose: every STARTUP piece exports `install` (§3.4), which is what
 * lets a new package join without the coordinator's generator learning about it. Nothing
 * imports that name from a package specifier — the coordinator names a piece's URL directly —
 * so leaving it out of the shim costs nothing. Any OTHER collision is a defect in the split,
 * and `examples/pieces-bench/check.mjs` is where it fails.
 */
const AMBIGUOUS_BY_DESIGN = 'install';

/**
 * Read what each piece exports, and build the two indexes.
 *
 * The parse is one regular expression over the framework's own minified output, where a piece
 * ends in a single `export { a as b, c as d };` and never re-exports from elsewhere — a piece
 * is a closed box (§4.3), so a re-export would be a frontier that the split does not have.
 */
export function runtimeLinkage(
  pieces: readonly RuntimePiece[],
  io: RuntimeLinkIo,
): RuntimeLinkage {
  const byUrl = new Map<string, LinkedPiece>();
  const collected = new Map<string, Map<string, string[]>>();

  for (const piece of pieces) {
    const code = io.readFile(piece.file);
    if (code === undefined) continue; // discovery already said so; saying it twice helps nobody
    const exports = exportedNames(code);
    byUrl.set(piece.url, { ...piece, exports, code });

    const names = collected.get(piece.pkg) ?? new Map<string, string[]>();
    collected.set(piece.pkg, names);
    for (const name of exports) names.set(name, [...(names.get(name) ?? []), piece.url]);
  }

  const urlOf = new Map<string, ReadonlyMap<string, string>>();
  for (const [pkg, names] of collected) {
    const one = new Map<string, string>();
    for (const [name, urls] of names) {
      const first = urls[0];
      if (urls.length === 1 && first !== undefined) one.set(name, first);
    }
    urlOf.set(pkg, one);
  }

  const roots = new Set<string>();
  for (const piece of byUrl.values()) {
    const root = packageRootOf(piece.file, io);
    if (root !== undefined) roots.add(root);
  }

  return { urlOf, byUrl, packages: [...collected.keys()], roots: [...roots] };
}

/**
 * The package directory a published file belongs to: up from it until a `package.json`.
 *
 * Walked and not taken from the declaration, because what a publisher declares is a path
 * relative to itself (`./runtime`, and tomorrow `./dist/runtime`), so counting segments
 * backwards would be counting somebody else's decision.
 */
function packageRootOf(file: string, io: RuntimeLinkIo): string | undefined {
  let dir = file.slice(0, file.lastIndexOf('/'));
  for (;;) {
    if (io.readFile(`${dir}/package.json`) !== undefined) return dir;
    const parent = dir.slice(0, dir.lastIndexOf('/'));
    if (parent === '' || parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * The URL of one piece, by the package that publishes it and its name within that package.
 *
 * What the coordinator asks (SDD-45 §4.4): it names PIECES, so it needs `core/hydrate` to
 * become a URL. `undefined` when this build does not have it — a publisher whose runtime was
 * never built, which `FUD0804` has already said, or a piece that moved between versions.
 */
export function pieceUrl(
  linkage: RuntimeLinkage,
  pkg: string,
  name: string,
): string | undefined {
  for (const piece of linkage.byUrl.values()) {
    if (piece.pkg === pkg && piece.name === name) return piece.url;
  }
  return undefined;
}

/**
 * Whether a module is a publisher's OWN file, in which case its imports are not this pass's.
 *
 * Linking happens at the boundary the APPLICATION crosses — `import { signal } from
 * '@fudic/core'`, written in a component — and never inside a package. A package's own
 * internal imports belong to whatever part of it stayed bundled, and rewriting those breaks
 * two things at once: `@fudic/ssr`, which lives inside the Service Worker on purpose (§4.10),
 * reaches `@fudic/di` that way and would hand the worker's linker a URL it has no business
 * fetching; and the dependency is the PACKAGE's, not the application's, so it need not be
 * resolvable from the application at all — which is exactly how it failed, in a workspace app
 * that never declared `@fudic/di`.
 */
export function insidePublisher(importer: string | undefined, linkage: RuntimeLinkage): boolean {
  if (importer === undefined) return false;
  const path = importer.replace(/\\/gu, '/');
  return linkage.roots.some((root) => path.startsWith(`${root}/`));
}

/**
 * `export { r as signal, a as batch };` → `['signal', 'batch']`.
 *
 * The exported name is the one after `as`, because that is the name a consumer writes; the
 * one before it is the minifier's, and it is different on the next build.
 */
function exportedNames(code: string): readonly string[] {
  const names: string[] = [];
  for (const statement of code.matchAll(/export\s*\{([^}]*)\}/gu)) {
    for (const part of (statement[1] ?? '').split(',')) {
      const trimmed = part.trim();
      if (trimmed === '') continue;
      const pair = trimmed.split(/\s+as\s+/u);
      const name = (pair[1] ?? pair[0] ?? '').trim();
      if (name !== '' && name !== 'default') names.push(name);
    }
  }
  return names;
}

/**
 * The package a specifier belongs to, or `null` for everything else.
 *
 * Subpaths included — `@fudic/forms/dom` and `@fudic/di/page` are what the emit writes — and
 * `./package.json` excluded, which is a file and not a surface.
 */
export function publisherOf(source: string, packages: readonly string[]): string | null {
  for (const pkg of packages) {
    if (source === pkg) return pkg;
    if (source.startsWith(`${pkg}/`) && !source.endsWith('/package.json')) return pkg;
  }
  return null;
}

/**
 * The shim for one specifier: what is published as URLs, everything else from the package.
 *
 * The star comes FIRST and the explicit re-exports shadow it, which is what the language says
 * and what lets this be written without a second list of names: whatever `@fudic/transport`
 * exports and does not publish still resolves, still gets bundled, and still gets pruned if
 * nobody uses it.
 *
 * The star names the SPECIFIER ITSELF, which is not a circularity: an import whose importer is
 * a shim is left alone, so the resolver answers it the ordinary way, with the ordinary file.
 * Asking a resolver for that path in advance would have made the hook asynchronous, and the
 * hook that claims this plugin's virtual ids is on the path of every module in the build.
 *
 * One statement per PIECE and not per name, so the output has one import per URL.
 */
export function runtimeShim(pkg: string, linkage: RuntimeLinkage, specifier: string): string {
  const byPiece = new Map<string, string[]>();
  for (const [name, url] of linkage.urlOf.get(pkg) ?? new Map<string, string>()) {
    if (name === AMBIGUOUS_BY_DESIGN) continue;
    byPiece.set(url, [...(byPiece.get(url) ?? []), name]);
  }
  return [
    `export * from ${JSON.stringify(specifier)};`,
    ...[...byPiece]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([url, names]) => `export { ${names.toSorted().join(', ')} } from ${JSON.stringify(url)};`),
  ].join('\n');
}

/**
 * The pieces this build actually reached, read back out of the code it emitted — and out of
 * the pieces that code reaches, all the way down.
 *
 * Out of the code and not out of the module graph, because what has to be copied is what the
 * browser will ASK for, and the only honest record of that is the import that survived
 * minification, tree-shaking and the prune. It is also what makes the pruning measurable
 * (criterion 10): an application that never derives a signal emits no import of `computed`, so
 * no `computed.js` lands in its output — counted on the `dist`, not deduced from the source.
 *
 * **And transitively**, which is not a refinement: a piece names other pieces by URL (§4.3), so
 * `core/hydrate` asks for `dom/browser` and `core/registry` without any chunk of the
 * application ever mentioning them. Copying only what the application names leaves a `dist`
 * that 404s on the second hop — a deployable tree is the property §4.2 is about.
 */
export function linkedPieces(
  code: Iterable<string>,
  linkage: RuntimeLinkage,
): readonly LinkedPiece[] {
  const reached = new Map<string, LinkedPiece>();
  const queue: string[] = [];

  const take = (text: string): void => {
    // The three quotes, and the third one is not cosmetic: a piece that reaches another with
    // a DYNAMIC import writes the URL in a template literal — that is how `core/hydrate` asks
    // for the pieces SDD-45 §4.4.1 took out of the load — and a scanner blind to backticks
    // would leave those files uncopied. The application never names them, so the 404 would
    // arrive on the first gesture of a page that had already loaded fine.
    for (const match of text.matchAll(/["'`](\/_fudic\/[^"'`]+\.js)["'`]/gu)) {
      const url = match[1];
      if (url === undefined || reached.has(url)) continue;
      const piece = linkage.byUrl.get(url);
      // A URL with no piece behind it is not this pass's to report: discovery already said
      // what it could, and inventing a file here would publish bytes nobody built.
      if (piece === undefined) continue;
      reached.set(url, piece);
      queue.push(url);
    }
  };

  for (const text of code) take(text);
  while (queue.length > 0) {
    const url = queue.shift();
    const piece = url === undefined ? undefined : reached.get(url);
    if (piece !== undefined) take(piece.code);
  }
  return [...reached.values()].toSorted((a, b) => a.url.localeCompare(b.url));
}

/** One file to write under the output directory, and where its bytes came from. */
export interface PieceFile {
  /** Relative to `outDir`: `_fudic/0.0.1/core/signal.js`. */
  readonly fileName: string;
  readonly code: string;
}

/**
 * What to copy, and what is wrong with copying it.
 *
 * **`FUD0806`** — a piece carrying the build token is a piece with the application inside it
 * (§4.13), and the whole architecture rests on that being impossible: bytes shared by two
 * applications cannot hold a fact of one. It is checked rather than trusted because it is one
 * comparison here and an afternoon in a browser otherwise.
 *
 * **`FUD0802`** — the output already holds this URL with different bytes. It should not be
 * possible (§4.2): the same version of a package was built by the same build of the framework,
 * so two applications deploying over one origin overwrite each other with identical bytes. If
 * they differ, somebody published one version twice with two contents, and the second
 * application to deploy would silently change what the first one runs.
 */
export function piecesToCopy(
  pieces: readonly LinkedPiece[],
  onDisk: (fileName: string) => string | undefined,
): { readonly files: readonly PieceFile[]; readonly diagnostics: readonly FudicDiagnostic[] } {
  const files: PieceFile[] = [];
  const diagnostics: FudicDiagnostic[] = [];

  for (const piece of pieces) {
    if (piece.code.includes(BUILD_TOKEN)) {
      diagnostics.push({
        code: FUD_RUNTIME_PIECE_HAS_BUILD,
        file: piece.file,
        message:
          `the piece "${piece.url}" carries this build's token. A published piece is the ` +
          'same bytes for every application and every deploy, so it cannot hold a fact of ' +
          'one of them: something that belongs to the application was compiled into code ' +
          `that belongs to the framework, in "${piece.pkg}".`,
      });
      continue;
    }
    // `url` is origin-absolute and outside every app's `base` (§3.1); the file it names sits
    // at the same path inside the output, which is what makes a `dist` deployable on its own.
    const fileName = piece.url.slice(1);
    const existing = onDisk(fileName);
    if (existing !== undefined && existing !== piece.code) {
      diagnostics.push({
        code: FUD_RUNTIME_PIECE_DIFFERS,
        file: fileName,
        message:
          `the output already holds "${piece.url}" with different bytes than "${piece.pkg}" ` +
          'would copy there. Two applications sharing an origin write the same file with the ' +
          'same content, because the framework built it and not their builds: different ' +
          'content means one version of the package was published twice with two contents, ' +
          'and whichever deploys last decides what every page of the origin runs.',
      });
    }
    files.push({ fileName, code: piece.code });
  }
  return { files, diagnostics };
}
