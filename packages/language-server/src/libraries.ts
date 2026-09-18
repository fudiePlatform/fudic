/**
 * The fudic libraries a workspace folder depends on (SDD-43 §3.2, §4.4).
 *
 * The index sweeps a folder and PRUNES `node_modules` — «where almost all the files in a
 * project are, and a recursive read that visits it before discarding it pays for the whole
 * store» (SDD-24 §4.5). That prune stays exactly as it is. What this adds is not an
 * exception to it: it is ANOTHER SOURCE, and it works the way the compiler already works —
 * follow a declared graph instead of sweeping a directory.
 *
 * The cost is proportional to the number of dependencies, not to the size of the store, and
 * a project with a thousand packages and one fudic library reads one library.
 *
 * Why this has to exist at all: a component the compiler can see and the index cannot is a
 * component whose `$Props` never enters the TypeScript program, and there it is `any` — the
 * editor stops checking props, stops offering the contract and stops reporting the required
 * prop that is missing. That is BUG-23, reached through the door of libraries (§1.1). In a
 * pnpm workspace it happens to work, because a linked package keeps its files under the root
 * the editor swept; the same library installed from npm disappears. That accident is what
 * this closes.
 */

import { readProjectConfig, type ProjectConfig } from '@fudic/config';
import { toPosix } from './paths.js';
import type { FileSystemScanner } from './types.js';

/** A fudic library reachable from a project. */
export interface Library {
  /** The package name, as its `package.json` spells it. */
  readonly name: string;
  /** Absolute path of the package root, POSIX-shaped. */
  readonly root: string;
  readonly config: ProjectConfig;
  /** Every `.fud` the package holds. */
  readonly files: readonly string[];
}

/** The fields of a `package.json` a dependency graph is walked through. */
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies'] as const;

/**
 * Every fudic library `projectRoot` depends on, transitively.
 *
 * Never throws: a `package.json` that does not parse, a dependency that is not installed
 * and a package with no `fudic.json` are all ordinary states of a project being edited, and
 * each of them is simply not a library.
 */
export function findLibraries(projectRoot: string, io: FileSystemScanner): readonly Library[] {
  const found = new Map<string, Library>();
  const queue: string[] = [toPosix(projectRoot)];

  // `found` is what stops the walk, and it is enough for both jobs: a root enters the queue
  // only the first time it is seen, so a library shared by five packages is read once, and a
  // cycle — a guide that depends on the set that depends on it — closes on the first repeat.
  while (queue.length > 0) {
    // `pop` on a non-empty array, which the loop condition is: the assertion is for the
    // type and there is no second case for a test to take.
    const from = queue.pop() as string;

    for (const name of dependenciesOf(from, io)) {
      const root = packageRoot(from, name, io);
      if (root === undefined || found.has(root)) continue;

      const config = readProjectConfig(root, configIo(io)).config;
      // Only a package that says so. Reaching into one that did not is the coupling
      // `FUD0763` refuses in the build, and indexing it here would be the same mistake
      // made quietly.
      if (config === null || config.kind !== 'lib') continue;

      found.set(root, { name, root, config, files: io.fudFiles(root) });
      // A library may itself consume a library — a guide under a component set is the
      // case that motivated all of this (§4.6).
      queue.push(root);
    }
  }

  return [...found.values()];
}

/** The names a package declares as dependencies, in any of the three fields. */
function dependenciesOf(root: string, io: FileSystemScanner): readonly string[] {
  const text = io.readFile(`${root}/package.json`);
  if (text === undefined) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return []; // a manifest being edited declares nothing, and says nothing either
  }
  if (parsed === null || typeof parsed !== 'object') return [];

  const fields = parsed as Record<string, unknown>;
  const names = new Set<string>();
  for (const field of DEPENDENCY_FIELDS) {
    const value = fields[field];
    if (value === null || typeof value !== 'object') continue;
    for (const name of Object.keys(value as Record<string, unknown>)) names.add(name);
  }
  return [...names];
}

/**
 * Where `name` is installed for a package at `from`: the nearest `node_modules/<name>`.
 *
 * Walking up rather than asking a module resolver, for the reason `@fudic/resolve` gives:
 * a package that publishes `exports` need not export its own manifest, and most do not.
 * This finds the directory, which is what an index needs — not an entry point.
 */
function packageRoot(from: string, name: string, io: FileSystemScanner): string | undefined {
  let dir = from;
  for (;;) {
    const candidate = `${dir}/node_modules/${name}`;
    // Under its REAL name: a workspace package is installed as a link, and a module
    // resolver answers with the target. Indexing the link and resolving to the target is
    // two spellings of one file, and every lookup between them misses.
    if (io.readFile(`${candidate}/package.json`) !== undefined) return io.realPath(candidate);
    const parent = dir.slice(0, dir.lastIndexOf('/'));
    if (parent === '' || parent === dir) return undefined;
    dir = parent;
  }
}

/** `@fudic/config`'s I/O seam, over the scanner this server already has. */
function configIo(io: FileSystemScanner): { exists(path: string): boolean; read(path: string): string } {
  return {
    exists: (path) => io.readFile(path) !== undefined,
    // `readProjectConfig` asks `exists` first and reads in the same tick, so the two cannot
    // disagree. The assertion is for the type; a fallback here would be a branch nothing
    // can take, and `readProjectConfig` reports an unreadable file itself.
    read: (path) => io.readFile(path) as string,
  };
}
