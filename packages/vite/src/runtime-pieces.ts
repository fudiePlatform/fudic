/**
 * The published runtime pieces this project reaches (SDD-45 §3.3, §3.5).
 *
 * A package says it publishes a runtime in its own manifest —
 * `"fudic": { "runtime": "./runtime" }` — and produces that directory in its build: one
 * bundled, minified file per piece (§3.3). This module is the half that READS that
 * declaration, and it is deliberately the whole of what the plugin knows about the matter:
 * how a piece was built is the publisher's business, which is what lets a package choose a
 * different frontier without anyone touching the linker.
 *
 * **No package is named here, and that is a requirement rather than a style** (§5). The day
 * `@fudic/http` exists it publishes pieces by declaring them, not by being added to a list —
 * so discovery goes through package RESOLUTION over the declared dependency graph, the same
 * way SDD-43 answers «which libraries does this project have». `node_modules` is never
 * scanned: the cost is the number of declared dependencies, not the size of the store, and a
 * sweep would find packages this project does not actually depend on.
 *
 * The graph is walked from the consumer AND from every fudic library it reaches, because a
 * library's `.fud` is compiled by the consumer's build (SDD-43 §4.1): a piece that only a
 * library imports is as much a piece of this build as one the application imports itself.
 *
 * Nothing here throws. A manifest that does not parse, a dependency that is not installed and
 * a declared directory that was never built are ordinary states of a project, and the last of
 * the three is the only one worth a word — `FUD0804`.
 *
 * Discovery only: which pieces exist and what they would be called. Rewriting imports,
 * copying files and naming them in a coordinator happen elsewhere.
 */

import { RUNTIME_DIR } from '@fudic/conventions';
import { dependencyChain, type PackageFs } from '@fudic/resolve';
import { FUD_RUNTIME_DIR_MISSING, type FudicDiagnostic } from './diagnostics.js';

/** One published piece this build links. */
export interface RuntimePiece {
  /** The package that publishes it: `@fudic/core`. */
  readonly pkg: string;
  /** Its name within that package: `hydrate`. */
  readonly name: string;
  /** The URL it resolves to: `/_fudic/0.0.1/core/hydrate.js`. */
  readonly url: string;
  /** Absolute path of the file to copy into the output. */
  readonly file: string;
}

/**
 * What discovery needs of the world, on top of walking a dependency graph.
 *
 * Injected for the reason every reader in this package injects it: the logic is pure text and
 * path work, and a seam is what keeps it that way. The directory listing is the only thing
 * added to `PackageFs`, because a publisher declares a DIRECTORY and the pieces are whatever
 * it holds — asking for a list of names would be a second declaration to keep in step.
 */
export interface RuntimeFs extends PackageFs {
  /** The entries directly inside `dir`, or `undefined` when there is no such directory. */
  readDir(dir: string): readonly string[] | undefined;
}

/** Every piece this build links, and what was wrong with a declaration that has none. */
export interface RuntimePiecesResult {
  readonly pieces: readonly RuntimePiece[];
  readonly diagnostics: readonly FudicDiagnostic[];
}

/** The fields of a `package.json` a dependency graph is walked through. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

/**
 * Every piece published by a package `projectRoot` resolves, in no particular order.
 *
 * The walk starts at the project and at every fudic library of its chain, and from there goes
 * THROUGH a publisher and stops at anything else. A publisher is a link because pieces reach
 * pieces — `@fudic/core` imports `@fudic/dom`'s `browser` and declares it external (§4.3) —
 * so a package the application never names still ends up in the origin.
 */
export function runtimePieces(projectRoot: string, io: RuntimeFs): RuntimePiecesResult {
  const pieces: RuntimePiece[] = [];
  const diagnostics: FudicDiagnostic[] = [];
  const seen = new Set<string>();

  const visit = (root: string, fromConsumer: boolean): void => {
    if (seen.has(root)) return;
    seen.add(root);

    const manifest = manifestOf(root, io);
    if (manifest === undefined) return;

    const declared = runtimeDirOf(manifest);
    if (declared !== undefined) collect(root, manifest, declared, io, pieces, diagnostics);
    // A package that publishes nothing is not a link in this graph: reading its dependencies
    // would put the whole store back on the bill, which is the argument `@fudic/resolve`
    // already makes about walking through a library and not through everything.
    if (!fromConsumer && declared === undefined) return;

    for (const name of dependenciesOf(manifest)) {
      const dependency = packageRootOf(root, name, io);
      if (dependency !== undefined) visit(dependency, false);
    }
  };

  // The project itself first, whatever it declares about being a fudic project: which pieces
  // a build links is a fact of its dependencies, and `dependencyChain` returns only packages
  // that carry a `fudic.json`. Then its libraries, from the one walk SDD-43 already does.
  visit(realRoot(projectRoot, io), true);
  for (const pkg of dependencyChain(projectRoot, io)) visit(pkg.root, true);

  return { pieces, diagnostics };
}

/**
 * The pieces of one publisher, or `FUD0804` when the directory it declared is not there.
 *
 * Only the files directly inside it, and only `.js`: the published shape is
 * `<version>/<pkg>/<piece>.js` (§3.1) and it is flat, so a subdirectory is not a piece with a
 * longer name — it is something else that happens to live there, and inventing a name for it
 * would publish a URL nobody can write.
 */
function collect(
  root: string,
  manifest: Readonly<Record<string, unknown>>,
  declared: string,
  io: RuntimeFs,
  pieces: RuntimePiece[],
  diagnostics: FudicDiagnostic[],
): void {
  const name = stringField(manifest, 'name');
  const label = name ?? root; // a manifest with no name still has to be nameable in a message
  const dir = `${root}/${declared}`;
  const files = (io.readDir(dir) ?? [])
    .filter((entry) => entry.endsWith('.js'))
    // Sorted so the same project always produces the same order: a directory listing is the
    // platform's order, and a build artifact that depends on it is a build that differs by
    // machine — the one property SDD-45 cannot give up.
    .toSorted();

  if (files.length === 0) {
    diagnostics.push({
      code: FUD_RUNTIME_DIR_MISSING,
      file: label,
      message:
        `the package "${label}" declares fudic.runtime "${declared}", and that directory ` +
        'does not exist or holds no piece. A package that declares it produces one bundled ' +
        'file per piece there in its own build, and this build links those files by URL: run ' +
        "the publisher's build, or remove the declaration.",
    });
    return;
  }

  // The version comes from the `package.json`, which owns it (§2), and it is what identifies
  // these files. Without it — or without a name — there is no URL to write, so the package
  // publishes nothing here rather than publishing one that resolves to the wrong place.
  const version = stringField(manifest, 'version');
  if (name === undefined || version === undefined) return;

  const short = shortName(name);
  for (const file of files) {
    const piece = file.slice(0, -'.js'.length);
    pieces.push({
      pkg: name,
      name: piece,
      // No application `base`: the runtime lives outside every app's, which is what lets two
      // applications of one origin ask for the same bytes (§3.1).
      url: `/${RUNTIME_DIR}/${version}/${short}/${piece}.js`,
      file: `${dir}/${file}`,
    });
  }
}

/**
 * What a package declares as its runtime directory, relative to its own root.
 *
 * A declaration that is not a non-empty string points nowhere, and a package that points
 * nowhere has not declared one — reporting `FUD0804` for it would be reporting a directory
 * that was never named.
 */
function runtimeDirOf(manifest: Readonly<Record<string, unknown>>): string | undefined {
  const fudic = manifest['fudic'];
  if (fudic === null || typeof fudic !== 'object') return undefined;
  const declared = (fudic as Record<string, unknown>)['runtime'];
  if (typeof declared !== 'string') return undefined;
  const relative = declared.trim().replace(/^\.\//u, '').replace(/\/+$/u, '');
  return relative === '' ? undefined : relative;
}

/**
 * `@fudic/core` → `core`, and a package without a scope keeps its name.
 *
 * The package segment is not decoration (§3.1): `element` exists in `core` and in `forms`,
 * `registry` in `core` and in `di`, and without it two different pieces claim one URL.
 */
function shortName(name: string): string {
  const cut = name.lastIndexOf('/');
  return cut === -1 ? name : name.slice(cut + 1);
}

/** A manifest field that has to be a non-empty string, or `undefined`. */
function stringField(
  manifest: Readonly<Record<string, unknown>>,
  field: string,
): string | undefined {
  const value = manifest[field];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** The names a package declares as dependencies, in any of the three fields. */
function dependenciesOf(manifest: Readonly<Record<string, unknown>>): readonly string[] {
  const names = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (value === null || typeof value !== 'object') continue;
    for (const name of Object.keys(value as Record<string, unknown>)) names.add(name);
  }
  return [...names];
}

/** A package's manifest as a plain object, or `undefined` when there is none to read. */
function manifestOf(root: string, io: RuntimeFs): Record<string, unknown> | undefined {
  const text = io.readFile(`${root}/package.json`);
  if (text === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined; // a manifest being edited declares nothing, and says nothing either
  }
  if (parsed === null || typeof parsed !== 'object') return undefined;
  return parsed as Record<string, unknown>;
}

/**
 * Where `name` is installed for a package at `from`: the nearest `node_modules/<name>`.
 *
 * The directory, not an entry point, and found by walking up rather than by asking the module
 * resolver — a package that publishes `exports` need not export its own manifest, and most do
 * not. It is the same lookup `@fudic/resolve` makes for a library, for the same reason.
 */
function packageRootOf(from: string, name: string, io: RuntimeFs): string | undefined {
  let dir = from;
  for (;;) {
    const candidate = `${dir}/node_modules/${name}`;
    if (io.readFile(`${candidate}/package.json`) !== undefined) return realRoot(candidate, io);
    const parent = dir.slice(0, dir.lastIndexOf('/'));
    if (parent === '' || parent === dir) return undefined;
    dir = parent;
  }
}

/**
 * A directory under the one spelling this walk uses: real name, POSIX separators.
 *
 * A workspace package is installed as a LINK, so the same package is reachable under two
 * spellings and would otherwise be visited — and its pieces published — twice. Normalized
 * here and not trusted to the port, because `node:fs` hands back backslashes on Windows and
 * one mixed separator is enough to make `${root}/node_modules/<name>` miss.
 */
function realRoot(root: string, io: RuntimeFs): string {
  return toPosix(io.realPath(toPosix(root)));
}

/** `\` → `/`: every path in this module is POSIX, so two spellings never disagree. */
function toPosix(path: string): string {
  return path.replace(/\\/gu, '/');
}
