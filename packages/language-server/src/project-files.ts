/**
 * Every `.fud` of the workspace, in the TypeScript program (BUG-23).
 *
 * A page projects its neighbours' contracts by importing them:
 *
 *     import type { $Props as $C0 } from '../components/app-input.fud';
 *
 * and Volar resolves that specifier only when `app-input.fud` is a source script it already
 * knows — `resolveModuleName.js` looks the name up with `language.scripts.get` and gives up
 * when there is no entry. A project built from an inferred file list knows only the files the
 * editor has OPENED, so a component nobody opened resolved to nothing, `$C0` became `any`, and
 * with `any` the checker stops checking and the completion list stops being a list:
 *
 *   - `.id="@('hola')"` on a `id: number` prop reports nothing;
 *   - a missing required prop reports nothing;
 *   - a `.` offers the whole global scope with auto-imports instead of the contract.
 *
 * All three at once, which is why they looked like three bugs. They were one: the contract was
 * never in the program. Opening the component in a second tab made them all appear, which is
 * exactly the tell of a file list rather than of a projection.
 *
 * The index is already the authority on which files those are — it scanned the roots at
 * `initialize` and it is kept current by `didChangeWatchedFiles` — so this adds a list, never
 * a scan.
 */

import type * as ts from 'typescript';
import type { WorkspaceIndex } from './workspace-index.js';

/**
 * Add every indexed `.fud` to a language service host's file list.
 *
 * Patched in place and read LAZILY, for the two reasons the patch exists at all: the object is
 * Volar's and it keeps decorating it afterwards, and the index grows while the server runs — a
 * component created after `initialize` has to enter the program without a restart, so the
 * closure asks the index on every call rather than capturing its contents once.
 *
 * Only the names. The snapshot still comes from Volar, which builds the virtual code through
 * the language plugin; this says WHICH files the program is made of, not what is in them.
 *
 * Returns how many were added, which is what the log line reports.
 */
export function mountWorkspaceFuds(host: ts.LanguageServiceHost, index: WorkspaceIndex): number {
  const getScriptFileNames = host.getScriptFileNames.bind(host);

  host.getScriptFileNames = () => {
    const names = getScriptFileNames();
    // A Set, because a project WITH a tsconfig that already covers `.fud` would otherwise list
    // every component twice — and a duplicate root name is a program with two of each
    // declaration, which is `TS2300` on every export the contract has.
    const all = new Set(names.map(normalize));
    for (const entry of index.all()) all.add(normalize(entry.path));
    return [...all];
  };

  return index.all().length;
}

/**
 * The one spelling of a path this comparison uses.
 *
 * The index keeps POSIX paths and a Windows host hands back `C:\…`, so the same file arrives
 * under two names and the Set would not see them as one. Deduplicating on the raw strings is
 * what would put `app-input.fud` in the program twice on Windows and once anywhere else.
 */
function normalize(path: string): string {
  return path.replace(/\\/g, '/');
}
