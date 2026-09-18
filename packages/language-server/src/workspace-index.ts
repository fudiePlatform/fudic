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
import {
  contractOf,
  layoutHrefOf,
  roleOf,
  sectionsOf,
  tagOf,
  type Contract,
  type FudRole,
} from './mode.js';
// The dependency walk lives in `@fudic/resolve`: the CLI asks the same question — which tags
// a library already defines — and the build asks it in order, for the style chain of §4.6.
import { findLibraries } from '@fudic/resolve';
import { toPosix } from './paths.js';
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
  /**
   * The props a component declares without a `?`, in declaration order. Empty for everything
   * else — and empty also when they cannot be proven, which is what makes the tag expansion
   * degrade to the plain element instead of inventing tabstops (BUG-23 task 25).
   */
  readonly requiredProps: readonly string[];
  /**
   * Everything the component declares to whoever writes its tag: props, slots, events and the
   * doc its author wrote (SDD-36 §3.2). Empty for everything that is not a component.
   *
   * Kept here for the reason `sections` is: the file was parsed to learn its role, so reading
   * the contract is free — once per file and per change, never per keystroke — and the card of
   * a component nobody has opened has to come from somewhere.
   */
  readonly contract: Contract;
  /**
   * Whether this `.fud` belongs to a LIBRARY and not to the workspace (SDD-43 §4.4).
   *
   * It is in the index and in the TypeScript program for the same reason every other file
   * is — so the contract it declares is a type and not `any` — and it is read-only: it is
   * navigated, hovered and jumped into, but not diagnosed as the author's own code and not
   * formatted on save. The author of an app does not fix a library's warnings.
   */
  readonly external: boolean;
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

  /**
   * The start-up sweep. Replaces whatever the index held for `root`'s files.
   *
   * Two sources, and the second is not an exception to the first: the folder is swept with
   * `node_modules` pruned exactly as before, and the libraries are reached by following the
   * DECLARED dependency graph (SDD-43 §4.4). What that buys is a contract that survives the
   * library being installed rather than linked — which in a pnpm workspace is the only
   * reason this ever appeared to work.
   */
  scan(root: string): void {
    for (const path of this.#scanner.fudFiles(root)) this.upsert(path);
    for (const library of findLibraries(root, this.#scanner)) {
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
    const source = this.#scanner.readFile(key);
    if (source === undefined) {
      this.remove(key);
      return;
    }

    this.#revision++;
    const { document } = parseFud(source);
    // One read of the contract, and the required props come OUT of it: asking twice would run
    // the `@code` extraction twice per change, and — worse — would let the two answers differ.
    const contract = contractOf(source, document);
    this.#entries.set(key, {
      path: key,
      role: roleOf(document),
      tag: tagOf(document),
      layoutHref: layoutHrefOf(document),
      sections: sectionsOf(document),
      requiredProps: contract.props.filter((prop) => prop.required).map((prop) => prop.name),
      contract,
      external,
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

  /**
   * What an `href` written inside `fromFile` points at, if anything.
   *
   * The arithmetic moved to the scanner with SDD-43: an href may name a package and not
   * only a location, and answering that needs a disk. What stays here is the lookup, which
   * is what makes this a map access per keystroke and not a filesystem question.
   */
  resolve(fromFile: string, href: string): IndexEntry | undefined {
    return this.#entries.get(toPosix(this.#scanner.resolveHref(toPosix(fromFile), href)));
  }
}
