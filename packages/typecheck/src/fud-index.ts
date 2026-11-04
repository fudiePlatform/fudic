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
import {
  documentRoots,
  span,
  walk,
  type ProjectModule,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';
import { CONFIG_FILE, readProjectConfig } from '@fudic/config';
import { PIPES_DIR, SRC_DIR } from '@fudic/conventions';
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
  /**
   * Every custom element in its markup other than its own host, with the span of the tag name.
   *
   * Every one and not only those a `<link rel="component">` resolves: what a link resolves to
   * depends on files indexed after this one, so `usesOf` asks the index at query time.
   */
  readonly uses: readonly TagUse[];
}

/** One element written with a component tag. */
export interface TagUse {
  readonly tag: string;
  readonly span: Span;
}

/** Where a component tag is used: the file and the tag name in it. */
export interface TagUseSite {
  readonly path: string;
  readonly span: Span;
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
    uses: usesIn(input.document),
  };
}

/**
 * The custom elements a document writes, in source order. A native element has no hyphen
 * (decision 41), and a component's own host is its definition, not a use.
 */
function usesIn(document: StructuredDocument): readonly TagUse[] {
  const own = tagOf(document);
  const uses: TagUse[] = [];
  walk(documentRoots(document), {
    element(el) {
      if (!el.name.includes('-') || el.name === own) return;
      // `<` and then the name: the open tag starts with it.
      const start = el.openSpan.start + 1;
      uses.push({ tag: el.name, span: span(start, start + el.name.length) });
    },
  });
  return uses;
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
   * Where a component tag is used, across the project and its libraries, ordered by path and
   * position. Only a tag some indexed component defines has uses: anything else is a typo or a
   * native custom element, and listing it as a reference would be a guess.
   */
  usesOf(tag: string): readonly TagUseSite[] {
    const entries = this.all();
    if (!entries.some((entry) => entry.tag === tag)) return [];
    return entries
      .flatMap((entry) =>
        entry.uses.filter((use) => use.tag === tag).map((use) => ({ path: entry.path, span: use.span })),
      )
      .sort((a, b) => (a.path === b.path ? a.span.start - b.span.start : a.path < b.path ? -1 : 1));
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
    if (!specifier.startsWith('.') && !specifier.startsWith('/') && !/^[A-Za-z]:\//u.test(specifier)) return this.#libraryModule(fromFile, specifier);
    const base = this.serverPath(fromFile, specifier);
    const root = [...this.#roots].find((r) => base.startsWith(`${r}/`));
    if (root === undefined) return undefined;
    for (const path of new Set([base, `${base}.ts`, base.replace(/\.js$/u, '.ts'), `${base}/index.ts`])) {
      const source = this.fs.readFile(path);
      if (source === undefined) continue;
      const pipe = path.startsWith(`${root}/${this.#pipesOf(root)}/`);
      const cached = this.#modules.get(path);
      if (cached?.source === source && (cached.pipe === true) === pipe) return cached;
      const module: ProjectModule = { path, source, ...(pipe ? { pipe } : {}) };
      this.#modules.set(path, module);
      return module;
    }
    return undefined;
  }

  /**
   * A module a package specifier reaches, when that package is a fudic library — its root, the
   * nearest folder above the file with a `package.json`, has a `fudic.json` (SDD-66 §4.2). The
   * specifier names the file through the package's `exports`, so it is resolved as an href is.
   */
  #libraryModule(fromFile: string, specifier: string): ProjectModule | undefined {
    const path = this.serverPath(fromFile, specifier);
    const source = this.fs.readFile(path);
    if (source === undefined) return undefined;
    let root = path.slice(0, path.lastIndexOf('/'));
    while (this.fs.readFile(`${root}/package.json`) === undefined && root.includes('/')) root = root.slice(0, root.lastIndexOf('/'));
    if (this.fs.readFile(`${root}/${CONFIG_FILE}`) === undefined) return undefined;
    const cached = this.#modules.get(path);
    if (cached?.source === source && cached.library === true) return cached;
    const module: ProjectModule = { path, source, library: true };
    this.#modules.set(path, module);
    return module;
  }

  /** The folder of pipes of a project (SDD-71 §3.1): its `fudic.json`'s `pipes`, read each time. */
  #pipesOf(root: string): string {
    // Read once: the reader asks `exists` before `read`, and the text it gets is this one.
    const text = this.fs.readFile(`${root}/${CONFIG_FILE}`);
    if (text === undefined) return PIPES_DIR;
    const { config } = readProjectConfig(root, { exists: () => true, read: () => text });
    return config?.pipes ?? PIPES_DIR;
  }

  /**
   * The `.fudapi` of a `<link rel="server">` (SDD-60 §4.7): its `<id>` — its path inside the
   * `src/` of a swept project —, whether it declares `load`, and the names it gives the file.
   * Read from the disk each time it is asked: it is not a `.fud`, and the index keeps none.
   */
  server(fromFile: string, href: string): ServerImport | undefined {
    const path = this.serverPath(fromFile, href);
    const root = this.#projectOf(path);
    const text = path.endsWith(API_EXTENSION) ? this.fs.readFile(path) : undefined;
    if (root === undefined || text === undefined) return undefined;
    const declarations = parseApi(text).value.declarations;
    const names = declarations.flatMap((d) =>
      d.kind === 'fn' ? [d.name.text, ...(d.form === undefined ? [] : [d.form.name.text])] : d.kind === 'form' ? [d.name.text] : [],
    );
    const later = declarations.flatMap((d) => (d.kind === 'load' ? d.fields.filter((f) => f.later !== undefined) : []));
    return {
      id: path.slice(root.length + SRC_DIR.length + 2, -API_EXTENSION.length),
      load: declarations.some((d) => d.kind === 'load'),
      names: [...new Set(names)],
      ...(later.length === 0
        ? {}
        : { later: later.map((f) => ({ name: f.name.text, type: text.slice(f.type.span.start, f.type.span.end) })) }),
    };
  }

  /**
   * The project whose `src/` holds `path`: the nearest folder with a `package.json`, inside a
   * swept root, or the root itself. The editor sweeps the folder it was opened on, which is
   * the project only when it was opened there: opened on a monorepo, `examples/basic/src/…`
   * is not under `<root>/src/`, and every contract of the example would be missing.
   */
  #projectOf(path: string): string | undefined {
    for (const root of this.#roots) {
      if (!path.startsWith(`${root}/`)) continue;
      for (let dir = path.slice(0, path.lastIndexOf('/')); dir.length > root.length; dir = dir.slice(0, dir.lastIndexOf('/'))) {
        if (path.startsWith(`${dir}/${SRC_DIR}/`) && this.fs.readFile(`${dir}/package.json`) !== undefined) return dir;
      }
      if (path.startsWith(`${root}/${SRC_DIR}/`)) return root;
    }
    return undefined;
  }
}
