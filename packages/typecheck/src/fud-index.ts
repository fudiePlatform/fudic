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

import { API_EXTENSION, parseApi } from '@fudic/api';
import type { ProjectModule, StructuredDocument } from '@fudic/compiler';
import { SRC_DIR } from '@fudic/conventions';
import type { ServerImport } from '@fudic/language-core';
import { findLibraries, type LookupFailure } from '@fudic/resolve';
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
  /** The projects swept: where the `<id>` of a `.fudapi` is read from. */
  readonly #roots = new Set<string>();
  /** The modules of the project last read, by path: the same object back while the text is. */
  readonly #modules = new Map<string, ProjectModule>();
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
    this.#roots.add(toPosix(root));
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

  failure(fromFile: string, href: string): LookupFailure | undefined {
    return this.fs.hrefFailure(toPosix(fromFile), href);
  }

  /**
   * Where the `href` of a `<link rel="server">` written inside `fromFile` points, whether or
   * not there is a file there: what tells the editor which `.fud` a changed `.fudapi` touches.
   */
  serverPath(fromFile: string, href: string): string {
    return toPosix(this.fs.resolveHref(toPosix(fromFile), href));
  }

  /** A file, read: the text a diagnostic located in it is shown over. Never throws. */
  read(path: string): string | undefined {
    return this.fs.readFile(toPosix(path));
  }

  /**
   * A module of a swept project that `fromFile` imports as `specifier` (SDD-61 §4.1): a relative
   * or absolute specifier, written as TypeScript resolves it — with its extension, with `.js` for
   * a `.ts`, with none, or naming a folder's `index.ts`.
   *
   * Read from the disk each time it is asked, as a `.fudapi` is, and handed back as the SAME
   * object while its text is the same: the compiler parses a module once per object, so this is
   * what keeps it parsed once per version without the index having to be told of a change.
   */
  module(fromFile: string, specifier: string): ProjectModule | undefined {
    // Relative, or absolute: from the root of the disk, or from a drive on Windows.
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !/^[A-Za-z]:\//u.test(specifier)) return undefined;
    const base = this.serverPath(fromFile, specifier);
    if (![...this.#roots].some((root) => base.startsWith(`${root}/`))) return undefined;
    for (const path of new Set([base, `${base}.ts`, base.replace(/\.js$/u, '.ts'), `${base}/index.ts`])) {
      const source = this.fs.readFile(path);
      if (source === undefined) continue;
      const cached = this.#modules.get(path);
      if (cached?.source === source) return cached;
      const module: ProjectModule = { path, source };
      this.#modules.set(path, module);
      return module;
    }
    return undefined;
  }

  /**
   * The `.fudapi` of a `<link rel="server">` (SDD-60 §4.7): its `<id>` — its path inside the
   * `src/` of a swept project —, whether it declares `load`, and the names it gives the file.
   * Read from the disk each time it is asked: it is not a `.fud`, and the index keeps none.
   */
  server(fromFile: string, href: string): ServerImport | undefined {
    const path = this.serverPath(fromFile, href);
    const root = [...this.#roots].find((r) => path.startsWith(`${r}/${SRC_DIR}/`));
    const text = path.endsWith(API_EXTENSION) ? this.fs.readFile(path) : undefined;
    if (root === undefined || text === undefined) return undefined;
    const declarations = parseApi(text).value.declarations;
    const names = declarations.flatMap((d) =>
      d.kind === 'fn' ? [d.name.text, ...(d.form === undefined ? [] : [d.form.name.text])] : d.kind === 'form' ? [d.name.text] : [],
    );
    return {
      id: path.slice(root.length + SRC_DIR.length + 2, -API_EXTENSION.length),
      load: declarations.some((d) => d.kind === 'load'),
      names: [...new Set(names)],
    };
  }
}
