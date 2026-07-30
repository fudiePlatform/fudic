/**
 * The workspace index (SDD-24 §4.5): every `.fud` of the folder with its role and its tag.
 *
 * This is the state that makes the `FileRegistry` of SDD-23 implementable without synchronous
 * I/O per keystroke. One sweep at start-up, maintained afterwards by the watchers; resolving
 * a file's `<link>`s then becomes a map lookup in memory.
 *
 * Invalidation is per file, never global: dropping the whole index on every `fudic generate`
 * would turn each scaffolding into a full repaint of the workspace.
 */

import { parseFud } from './parse.js';
import { layoutHrefOf, roleOf, sectionsOf, tagOf, type FudRole } from './mode.js';
import { resolveFrom, toPosix } from './paths.js';
import type { FileSystemScanner } from './types.js';

/** What the index knows about one `.fud`. */
export interface IndexEntry {
  /** Absolute path, POSIX-shaped — the key. */
  readonly path: string;
  readonly role: FudRole;
  /** The tag it defines, `''` for anything that is not a component. */
  readonly tag: string;
  /** Its `<link rel="layout">` href, `''` when it declares none. */
  readonly layoutHref: string;
  /**
   * The sections a layout declares with `@RenderSection`, in source order. Empty for
   * everything else.
   *
   * Kept here because the alternative is parsing the layout on every keystroke of
   * `@section `: the file was already parsed to learn its role, so the names are free.
   */
  readonly sections: readonly string[];
}

export class WorkspaceIndex {
  readonly #scanner: FileSystemScanner;
  readonly #entries = new Map<string, IndexEntry>();
  #revision = 0;

  constructor(scanner: FileSystemScanner) {
    this.#scanner = scanner;
  }

  /**
   * Bumped whenever the set of `.fud` changes.
   *
   * What a tag resolves to is not a property of one file: creating `app-card.fud` changes the
   * projection of every page that links it. This counter is how the document cache notices,
   * without anyone walking the workspace to find out who cared.
   */
  get revision(): number {
    return this.#revision;
  }

  /** The start-up sweep. Replaces whatever the index held for `root`'s files. */
  scan(root: string): void {
    for (const path of this.#scanner.fudFiles(root)) this.upsert(path);
  }

  /**
   * (Re)read one file into the index.
   *
   * A file that cannot be read is dropped rather than kept stale: between the watcher event
   * and this call the user may have deleted it, and a stale entry would resolve a tag to a
   * file that is not there.
   */
  upsert(path: string): void {
    const key = toPosix(path);
    const source = this.#scanner.readFile(key);
    if (source === undefined) {
      this.remove(key);
      return;
    }

    this.#revision++;
    const { document } = parseFud(source);
    this.#entries.set(key, {
      path: key,
      role: roleOf(document),
      tag: tagOf(document),
      layoutHref: layoutHrefOf(document),
      sections: sectionsOf(document),
    });
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

  get(path: string): IndexEntry | undefined {
    return this.#entries.get(toPosix(path));
  }

  /** Every entry, in insertion order. */
  all(): readonly IndexEntry[] {
    return [...this.#entries.values()];
  }

  /** Every entry of one role — what the `href` completion filters with (§4.2). */
  byRole(role: FudRole): readonly IndexEntry[] {
    return this.all().filter((entry) => entry.role === role);
  }

  /** What an `href` written inside `fromFile` points at, if anything. */
  resolve(fromFile: string, href: string): IndexEntry | undefined {
    return this.#entries.get(resolveFrom(toPosix(fromFile), href));
  }
}
