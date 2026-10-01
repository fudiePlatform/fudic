/**
 * An index of the `.fud` of a project (SDD-24 §4.5, SDD-35 §4.2): every file with what a link
 * to it resolves to.
 *
 * This is the state that makes the `FileRegistry` of SDD-23 implementable without I/O per
 * file. One sweep at start-up, maintained afterwards per file; resolving a file's `<link>`s
 * then becomes a map lookup in memory.
 *
 * The editor and the build both index the same files the same way, which is why the sweep, the
 * per-file update and the lookup live here once. What each one keeps about a file differs —
 * the editor also wants roles, contracts and snippets for its completions — so the entry is
 * built by a function the client supplies, over the one parse made here.
 *
 * Invalidation is per file, never global: dropping the whole index on every `fudic generate`
 * would turn each scaffolding into a full repaint of the project.
 */

import type { StructuredDocument } from '@fudic/compiler';
import { findLibraries } from '@fudic/resolve';
import type { CheckFs, FudList } from './files.js';
import type { LinkIndex, LinkTarget } from './link-index.js';
import { holesOf, tagOf } from './mode.js';
import { parseFud } from './parse.js';
import { toPosix } from './paths.js';

/** What every index knows about one `.fud`. */
export interface IndexedFud extends LinkTarget {
  /** Absolute path, POSIX-shaped — the key. */
  readonly path: string;
  /**
   * Whether this `.fud` belongs to a LIBRARY and not to the project (SDD-43 §4.4).
   *
   * It is in the index and in the TypeScript program for the same reason every other file is —
   * so the contract it declares is a type and not `any` — and it is read-only: it is not
   * diagnosed as the author's own code. The author of an app does not fix a library's errors.
   */
  readonly external: boolean;
}

/** What an entry is built from: the file, its text and its one parse. */
export interface DescribeInput {
  readonly path: string;
  readonly source: string;
  readonly document: StructuredDocument;
  readonly external: boolean;
}

/** The entry every index starts from: path, tag, holes, and whether it is a library's. */
export function describeFud(input: DescribeInput): IndexedFud {
  return {
    path: input.path,
    tag: tagOf(input.document),
    holes: holesOf(input.document),
    external: input.external,
  };
}

export class FudIndex<E extends IndexedFud = IndexedFud> implements LinkIndex, FudList {
  protected readonly fs: CheckFs;
  readonly #describe: (input: DescribeInput) => E;
  readonly #entries = new Map<string, E>();
  #revision = 0;

  constructor(fs: CheckFs, describe: (input: DescribeInput) => E) {
    this.fs = fs;
    this.#describe = describe;
  }

  /**
   * Bumped whenever the set of `.fud` changes.
   *
   * What a tag resolves to is not a property of one file: creating `app-card.fud` changes the
   * projection of every page that links it. This counter is how a projection cache notices,
   * without anyone walking the project to find out who cared.
   */
  get revision(): number {
    return this.#revision;
  }

  /**
   * The start-up sweep. Replaces whatever the index held for `root`'s files.
   *
   * Two sources, and the second is not an exception to the first: the folder is swept with
   * `node_modules` pruned, and the libraries are reached by following the DECLARED dependency
   * graph (SDD-43 §4.4). What that buys is a contract that survives the library being installed
   * rather than linked.
   */
  scan(root: string): void {
    for (const path of this.fs.fudFiles(root)) this.upsert(path);
    for (const library of findLibraries(root, this.fs)) {
      for (const path of library.files) this.upsert(path, true);
    }
  }

  /**
   * (Re)read one file into the index.
   *
   * A file that cannot be read is dropped rather than kept stale: between the watcher event
   * and this call the user may have deleted it, and a stale entry would resolve a tag to a
   * file that is not there.
   */
  upsert(path: string, external = false): void {
    const key = toPosix(path);
    const source = this.fs.readFile(key);
    if (source === undefined) {
      this.remove(key);
      return;
    }

    this.#revision++;
    const { document } = parseFud(source);
    this.#entries.set(key, this.#describe({ path: key, source, document, external }));
  }

  /** Drop a file. The revision only moves when something was actually there to drop. */
  remove(path: string): void {
    if (this.#entries.delete(toPosix(path))) this.#revision++;
  }

  /** A rename is a removal plus a read: the role travels with the content, not with the name. */
  rename(from: string, to: string): void {
    this.remove(from);
    this.upsert(to);
  }

  get(path: string): E | undefined {
    return this.#entries.get(toPosix(path));
  }

  /** Every entry, in insertion order. */
  all(): readonly E[] {
    return [...this.#entries.values()];
  }

  /**
   * What an `href` written inside `fromFile` points at, if anything.
   *
   * The arithmetic lives on the filesystem port: an href may name a package and not only a
   * location, and answering that needs a disk. What stays here is the lookup, which is what
   * makes this a map access and not a filesystem question.
   */
  resolve(fromFile: string, href: string): E | undefined {
    return this.#entries.get(toPosix(this.fs.resolveHref(toPosix(fromFile), href)));
  }
}
