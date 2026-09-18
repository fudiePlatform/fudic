/**
 * The packages a project depends on, and which of them are fudic libraries (SDD-43 §3.2,
 * §4.4, §4.6).
 *
 * One walk, three questions, and they belong together because they are the same traversal:
 *
 * - the **index** needs every library a workspace folder reaches, with its `.fud` files, so
 *   the contract of a library component enters the TypeScript program instead of being `any`;
 * - the **CLI** needs the tags those libraries define, so `fudic g component card` fails
 *   while generating rather than at the second `customElements.define`;
 * - the **build** needs the chain in dependency order, because a component adopts the style
 *   guides of the chain of the package that DEFINES it (§4.6).
 *
 * It lives here and not in the language server because two hosts ask it now and a third
 * will: a second copy is a second answer the day one of them falls behind, which is the same
 * argument that made this package exist (§3.1).
 *
 * What it is NOT is an exception to the index's prune of `node_modules` — «where almost all
 * the files in a project are, and a recursive read that visits it before discarding it pays
 * for the whole store» (SDD-24 §4.5). That prune stays. This is ANOTHER SOURCE, and it works
 * the way the compiler already works: follow a declared graph instead of sweeping a
 * directory. The cost is the number of dependencies, not the size of the store, and a
 * project with a thousand packages and one fudic library reads one library.
 *
 * Nothing here throws. A `package.json` that does not parse, a dependency that is not
 * installed and a package with no `fudic.json` are ordinary states of a project being
 * edited, and each of them is simply not a library.
 */

import { readProjectConfig, type ProjectConfig } from '@fudic/config';

/** What walking a dependency graph needs of the world. */
export interface PackageFs {
  /** File contents, or `undefined` when it cannot be read. Never throws. */
  readFile(path: string): string | undefined;
  /**
   * The same directory under its real name, with symlinks followed.
   *
   * A workspace package is installed as a LINK — `node_modules/@acme/ui` points at
   * `libs/ui` — so the same package is reachable under two spellings. One spelling, chosen
   * here, is what keeps a package counted once and keeps an index lookup from missing.
   */
  realPath(path: string): string;
}

/** What finding a library's FILES needs, on top of walking to it. */
export interface LibraryFs extends PackageFs {
  /** Every `.fud` under `root`, as absolute paths. */
  fudFiles(root: string): readonly string[];
}

/** A package on the dependency graph that carries a `fudic.json`. */
export interface FudicPackage {
  /** The package name, as its `package.json` spells it. `''` when it declares none. */
  readonly name: string;
  /** Absolute path of the package root, POSIX-shaped. */
  readonly root: string;
  readonly config: ProjectConfig;
}

/** A fudic library reachable from a project. */
export interface Library extends FudicPackage {
  /** Every `.fud` the package holds. */
  readonly files: readonly string[];
}

/** The fields of a `package.json` a dependency graph is walked through. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

/**
 * Every fudic library `projectRoot` depends on, transitively, with the files it publishes.
 *
 * The project itself is not one of them: it is the consumer, and a library it happens to be
 * is nobody's dependency here.
 */
export function findLibraries(projectRoot: string, io: LibraryFs): readonly Library[] {
  const start = realRoot(projectRoot, io);
  return dependencyChain(projectRoot, io)
    .filter((found) => found.root !== start && found.config.kind === 'lib')
    .map((found) => ({ ...found, files: io.fudFiles(found.root) }));
}

/**
 * The fudic packages of `packageRoot`'s dependency chain, DEPENDENCIES FIRST and the package
 * itself last.
 *
 * That order is the answer to §4.6: the style guides of a chain compose from the root of the
 * chain towards the leaf, so a component of `libs/ui` under a `libs/guia` adopts the guide's
 * sheet before its own. Reversing it would let a library restyle the guide it consumes.
 *
 * The traversal goes THROUGH a library and stops at anything else: a package that never
 * declared itself one is not a link in a fudic chain, and reading its dependencies would put
 * the whole store back on the bill.
 */
export function dependencyChain(packageRoot: string, io: PackageFs): readonly FudicPackage[] {
  const out: FudicPackage[] = [];
  const seen = new Set<string>();

  // Post-order: a package is appended after everything it depends on, which is the order
  // §4.6 asks for. `seen` is what makes a cycle — a guide that depends on the set that
  // depends on it — close on the first repeat instead of looping.
  const visit = (root: string, isStart: boolean): void => {
    if (seen.has(root)) return;
    seen.add(root);

    const config = readProjectConfig(root, configIo(io)).config;
    // The starting package is walked whatever it is — an app is the common case. Anything
    // else has to say it is a library, which is the same thing `FUD0763` asks of a link.
    if (!isStart && config?.kind !== 'lib') return;

    for (const name of dependenciesOf(root, io)) {
      const dependency = packageRootOf(root, name, io);
      if (dependency !== undefined) visit(dependency, false);
    }
    if (config !== null) out.push({ name: nameOf(root, io), root, config });
  };

  visit(realRoot(packageRoot, io), true);
  return out;
}

/**
 * The package a FILE belongs to: the nearest ancestor directory with a `package.json`.
 *
 * It is what answers «whose component is this», which is the question §4.6 turns on — a
 * component adopts the style guides of the chain of the package that DEFINES it, and a path
 * is all the emit ever knows about where a component came from.
 *
 * Going up from the file rather than asking a resolver, for the reason `packageRootOf` gives,
 * and it answers for every layout: a symlinked workspace member, a copy under `node_modules`,
 * or a store with hard links.
 */
export function owningPackage(file: string, io: PackageFs): string | undefined {
  let dir = toPosix(file);
  for (;;) {
    const cut = dir.lastIndexOf('/');
    // `<= 0` stops at the filesystem root: a package.json AT the root would be everybody's
    // package, which is a workspace layout nobody has.
    if (cut <= 0) return undefined;
    dir = dir.slice(0, cut);
    if (io.readFile(`${dir}/package.json`) !== undefined) return realRoot(dir, io);
  }
}

/**
 * A directory under the one spelling this walk uses: real name, POSIX separators.
 *
 * Normalized HERE and not trusted to the port, because a host's `realPath` is whatever its
 * platform hands back — on Windows `node:fs` answers with backslashes — and one mixed
 * separator is enough to make `${root}/node_modules/<name>` miss.
 */
function realRoot(root: string, io: PackageFs): string {
  return toPosix(io.realPath(toPosix(root)));
}

/** `\` → `/`: every path in this module is POSIX, so two spellings never disagree. */
function toPosix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** A package's own `name`, for a caller that has to name what it found. */
function nameOf(root: string, io: PackageFs): string {
  const manifest = manifestOf(root, io);
  const name = manifest?.['name'];
  return typeof name === 'string' ? name : '';
}

/** The names a package declares as dependencies, in any of the three fields. */
function dependenciesOf(root: string, io: PackageFs): readonly string[] {
  const manifest = manifestOf(root, io);
  if (manifest === undefined) return [];

  const names = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    const value = manifest[field];
    if (value === null || typeof value !== 'object') continue;
    for (const name of Object.keys(value as Record<string, unknown>)) names.add(name);
  }
  return [...names];
}

/** A package's manifest as a plain object, or `undefined` when there is none to read. */
function manifestOf(root: string, io: PackageFs): Record<string, unknown> | undefined {
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
 * Walking up rather than asking the module resolver, for the reason `resolveHref` gives: a
 * package that publishes `exports` need not export its own manifest, and most do not. This
 * finds the DIRECTORY, which is what a dependency walk needs — not an entry point.
 */
function packageRootOf(from: string, name: string, io: PackageFs): string | undefined {
  let dir = from;
  for (;;) {
    const candidate = `${dir}/node_modules/${name}`;
    if (io.readFile(`${candidate}/package.json`) !== undefined) return realRoot(candidate, io);
    const parent = dir.slice(0, dir.lastIndexOf('/'));
    if (parent === '' || parent === dir) return undefined;
    dir = parent;
  }
}

/** `@fudic/config`'s I/O seam, over the port this module already has. */
function configIo(io: PackageFs): { exists(path: string): boolean; read(path: string): string } {
  return {
    exists: (path) => io.readFile(path) !== undefined,
    // `readProjectConfig` asks `exists` first and reads in the same tick, so the two cannot
    // disagree. The assertion is for the type; a fallback here would be a branch nothing can
    // take, and `readProjectConfig` reports an unreadable file itself.
    read: (path) => io.readFile(path) as string,
  };
}
