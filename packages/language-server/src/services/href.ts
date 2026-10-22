/**
 * The one completion that does not delegate, and its diagnostic (SDD-24 §4.2).
 *
 * No language service knows what a `<link rel="component">` means, so this is the server's
 * own: the `.fud` this file can link, filtered by ROLE — `rel="component"` offers components
 * and `rel="layout"` offers layouts (decision 51) — and the `rel` that make a `<link>`
 * one of fudic's, so the author never has to remember them. An `href` that resolves
 * to nothing is `FUD0460`, which lives in `@fudic/typecheck` because the build reports it too.
 */

import type { ElementNode } from '@fudic/compiler';
import { relativeHref } from '@fudic/typecheck';
import { isUndecided, type FudRole } from '../mode.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import type { CachedDocument } from '../document-cache.js';
import type { HrefContext } from './position.js';

/** One candidate for an `href`. */
export interface HrefCompletion {
  /**
   * How it is written from the file being edited: `./` or `../` inside its own package, the
   * package's name for a file of a library it depends on.
   */
  readonly href: string;
  readonly path: string;
  readonly role: FudRole;
  /** The tag it defines, for a component. */
  readonly tag: string;
}

/** A `rel` fudic reads, and what it tells the author. */
export interface RelCompletion {
  readonly rel: HrefContext['rel'];
  readonly detail: string;
}

/**
 * The `rel` values this `<link>` may take, in the order they are most often written.
 *
 * `layout` only in a route (decision 81: a layout cannot name one, a component or a page has
 * none) and only while the route names no other — a second is `FUD0420`. Whether the file IS
 * a route is the structure's answer, and a route is recognised by its `<link rel="layout">`:
 * the file being started, whose first `<link>` has no `rel` yet, structures as a component.
 * That one has no tag of its own yet, so it may still become either.
 */
export function relCompletions(document: CachedDocument, link: ElementNode): readonly RelCompletion[] {
  const values: RelCompletion[] = [{ rel: 'component', detail: 'import a component' }];
  if (namesLayout(document, link)) {
    values.push({ rel: 'layout', detail: 'the layout this route renders inside' });
  }
  values.push({ rel: 'snippet', detail: 'import the snippets of a file' });
  if (linksServer(document)) values.push({ rel: 'server', detail: 'the contract of its server, a .fudapi' });
  return values;
}

/** Whether this `<link>` may be the layout of its file. */
function namesLayout(document: CachedDocument, link: ElementNode): boolean {
  const structured = document.document;
  if (isUndecided(structured)) return true;
  if (structured.type !== 'route-document') return false;
  // An absent layout link is a placeholder with an empty span.
  const named = structured.layoutLink.span;
  return named.start === named.end || named.start === link.span.start;
}

/**
 * Whether this file may link a `.fudapi` (SDD-60 §3.14): a route, a page or a component — the
 * file being started among them. A layout or a snippet file has no server (`FUD1112`).
 */
function linksServer(document: CachedDocument): boolean {
  const type = document.document.type;
  return type === 'component-document' || type === 'route-document' || type === 'page-document';
}

/** The `.fudapi` of the app, as the `href` completion of a `<link rel="server">` asks for them. */
export interface ApiFiles {
  /** Every `.fudapi` of the app the file belongs to, by path. */
  appFiles(fromFile: string): readonly string[];
  /** The text of a `.fudapi`: the editor's when it is open, the disk's when not. */
  read(path: string): string | undefined;
}

/** One `.fudapi` an `href` may name. */
export interface ApiHrefCompletion {
  readonly href: string;
  readonly path: string;
}

/**
 * The candidates for the `href` of a `<link rel="server">`: the contracts of the file's own app,
 * written relative to it. A library's `fudapi/` holds extensions and the built-ins, never a
 * server a file links, so none of them is offered.
 */
export function apiHrefCompletions(document: CachedDocument, apis: ApiFiles): readonly ApiHrefCompletion[] {
  return apis
    .appFiles(document.path)
    .map((path) => ({ href: relativeHref(document.path, path), path }))
    .sort((a, b) => a.href.localeCompare(b.href));
}

/** The role a `rel` may point at. */
function roleFor(rel: HrefContext['rel']): FudRole {
  if (rel === 'layout') return 'layout';
  return rel === 'snippet' ? 'snippet' : 'component';
}

/**
 * The candidates for the `href` under the cursor.
 *
 * The file itself never appears: a component that links itself is not a completion, it is a
 * cycle (FUD0422 territory).
 */
export function hrefCompletions(
  document: CachedDocument,
  index: WorkspaceIndex,
  context: HrefContext,
): readonly HrefCompletion[] {
  const hrefTo = index.linker(document.path);
  const completions: HrefCompletion[] = [];
  for (const entry of index.byRole(roleFor(context.rel))) {
    if (entry.path === document.path) continue;
    // Another project of the same folder, or a file its library does not export.
    const href = hrefTo(entry.path);
    if (href === undefined) continue;
    completions.push({ href, path: entry.path, role: entry.role, tag: entry.tag });
  }
  return completions.sort((a, b) => a.href.localeCompare(b.href));
}
