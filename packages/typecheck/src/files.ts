/**
 * The files a check is made of, and the one module that touches `node:fs` (SDD-24 §4.5,
 * SDD-35 §4.2).
 *
 * Everything else takes the `CheckFs` port, so an index can be driven from a map in tests and
 * the editor keeps its promise of never doing I/O per keystroke — the sweep happens once, and
 * the watchers do the rest.
 *
 * Nothing here throws. A folder that does not exist is an empty workspace, and a file that
 * disappeared between the watcher event and the read is `undefined`: both are ordinary
 * states of a project being edited, not failures.
 */

import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { nodeResolveFs, resolveHrefPath } from '@fudic/resolve';
import type * as ts from 'typescript';
import { toPosix } from './paths.js';

/**
 * The filesystem, narrowed to what an index of `.fud` files needs.
 *
 * A port, not `node:fs`: the only I/O of an index lives behind this interface — and a test can
 * hand it a folder that never touched a disk.
 */
export interface CheckFs {
  /** Every `.fud` under `root`, as absolute paths. Empty when `root` does not exist. */
  fudFiles(root: string): readonly string[];
  /** File contents, or `undefined` when it cannot be read. Never throws. */
  readFile(path: string): string | undefined;
  /**
   * Where an `href` written in `fromFile` points, as an absolute POSIX path (SDD-43 §4.3).
   *
   * A path resolves against the file, as it always did; a bare specifier
   * (`@acme/ui/card.fud`) resolves as an `import` would. It lives on this port and not in
   * the index because resolving a package is the one part of the question that needs a
   * disk, and the index is the thing that must never touch one.
   *
   * An href that does not resolve still answers a path — one that is simply not in the
   * index, which is the state a broken link has always had (`FUD0460`).
   */
  resolveHref(fromFile: string, href: string): string;
  /**
   * The same file under its real name, with symlinks followed (SDD-43 §4.4).
   *
   * A workspace package is installed as a LINK — `node_modules/@acme/ui` points at
   * `libs/ui` — and a module resolver answers with the real path. Index one spelling and
   * resolve to the other and every lookup misses, which reads exactly like a library that
   * is not there. One spelling, and this is where it is chosen.
   */
  realPath(path: string): string;
}

/** Folders a `.fud` sweep must never walk into. */
const SKIPPED = new Set(['node_modules', 'dist', '.git']);

/** The real filesystem, narrowed to what an index needs. */
export function nodeFileSystem(): CheckFs {
  // One resolver per filesystem: `createRequire` caches what it learns.
  const resolver = nodeResolveFs();

  return {
    /**
     * The sweep PRUNES as it descends; it does not walk everything and filter afterwards.
     *
     * The difference is not stylistic. `node_modules` is where almost all the files in a
     * project are, and a recursive read that visits it before discarding it pays for the
     * whole store — seconds, on the one operation §4.5 promised would happen once at
     * startup and never per keystroke.
     */
    fudFiles(root: string): readonly string[] {
      const base = toPosix(root);
      const found: string[] = [];

      const visit = (dir: string, prefix: string): void => {
        let entries;
        try {
          entries = readdirSync(dir, { withFileTypes: true });
        } catch {
          return; // the folder is not there: an empty workspace, not an error
        }
        for (const entry of entries) {
          if (SKIPPED.has(entry.name)) continue;
          const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
          if (entry.isDirectory()) visit(`${dir}/${entry.name}`, relative);
          else if (entry.name.endsWith('.fud')) found.push(`${base}/${relative}`);
        }
      };

      visit(root, '');
      return found;
    },

    readFile(path: string): string | undefined {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return undefined;
      }
    },

    /**
     * The SAME resolver the build uses (`@fudic/resolve`), normalized to the one spelling
     * the index keys by. Two resolvers would be two ideas of which file a tag is, and the
     * editor and the build disagreeing about that is the defect SDD-43 §5 names.
     */
    resolveHref(fromFile: string, href: string): string {
      return toPosix(resolveHrefPath(fromFile, href, resolver));
    },

    /**
     * A path that cannot be resolved is its own real name: the file is simply not there.
     *
     * `realpathSync` and not `realpathSync.native`: the native one answers in the
     * filesystem's canonical CASE, and on Windows that is a different string from the one
     * the editor sent — which the index keys by. Same file, two keys, and every lookup
     * between them misses.
     */
    realPath(path: string): string {
      try {
        return toPosix(realpathSync(path));
      } catch {
        return toPosix(path);
      }
    },
  };
}

/** Whatever lists the `.fud` of a project: the editor's index, the build's. */
export interface FudList {
  all(): readonly { readonly path: string }[];
}

/**
 * Add every listed `.fud` to a language service host's file list (BUG-23).
 *
 * A page projects its neighbours' contracts by importing them:
 *
 *     import type { $Props as $C0 } from '../components/app-input.fud';
 *
 * and Volar resolves that specifier only when `app-input.fud` is a source script it already
 * knows. A program built from an inferred file list knows only the files somebody opened, so
 * a component nobody opened resolved to nothing, `$C0` became `any`, and with `any` the checker
 * stops checking: a wrong prop type, a missing required prop, all silent.
 *
 * Patched in place and read LAZILY: the host is Volar's and it keeps decorating it afterwards,
 * and the list grows while the process runs — a component created later has to enter the
 * program without a restart, so the closure asks on every call rather than capturing once.
 *
 * Only the names. The snapshot still comes from Volar, which builds the virtual code through
 * the language plugin; this says WHICH files the program is made of, not what is in them.
 *
 * Returns how many were added, which is what the editor's log line reports.
 */
export function mountWorkspaceFuds(host: ts.LanguageServiceHost, list: FudList): number {
  const getScriptFileNames = host.getScriptFileNames.bind(host);

  host.getScriptFileNames = () => {
    const names = getScriptFileNames();
    // A Set, because a project WITH a tsconfig that already covers `.fud` would otherwise list
    // every component twice — and a duplicate root name is a program with two of each
    // declaration, which is `TS2300` on every export the contract has.
    const all = new Set(names.map(forward));
    for (const entry of list.all()) all.add(forward(entry.path));
    return [...all];
  };

  return list.all().length;
}

/**
 * The one spelling of a path this comparison uses.
 *
 * An index keeps POSIX paths and a Windows host hands back `C:\…`, so the same file arrives
 * under two names and the Set would not see them as one.
 */
function forward(path: string): string {
  return path.replace(/\\/g, '/');
}
