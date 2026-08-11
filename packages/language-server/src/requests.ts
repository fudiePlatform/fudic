/**
 * The server's own requests (SDD-24 §3.4).
 *
 * `fudic/virtualFiles` exists to debug the LSP while it is being built: without seeing what
 * `tsserver` is being shown, every odd diagnostic is debugged blind. It is instrumental, not a
 * convenience — which is why it ships in the server rather than in a branch.
 *
 * `fudic/componentRegistry` answers the other half of the same question: what this file's tags
 * resolve to, and which of them resolve to nothing at all.
 */

import { closingTagAt, linkHref } from '@fudic/compiler';
import type { CachedDocument } from './document-cache.js';
import type { WorkspaceIndex } from './workspace-index.js';
import { layoutHrefOf } from './mode.js';

export const VIRTUAL_FILES_REQUEST = 'fudic/virtualFiles';
export const COMPONENT_REGISTRY_REQUEST = 'fudic/componentRegistry';

/**
 * `fudic/autoCloseTag` — what the `>` the user just typed is asking for (BUG-22).
 *
 * A request rather than a capability because no capability covers it: closing a tag is not
 * formatting (the caret has to land BETWEEN the two tags, and a `TextEdit` cannot say that)
 * and not a completion (nothing was asked for). Every editor that does this for HTML does it
 * the same way — the editor notices the keystroke and asks.
 */
export const AUTO_CLOSE_TAG_REQUEST = 'fudic/autoCloseTag';

/** One virtual file, as the request reports it. */
export interface VirtualFilePayload {
  readonly fileName: string;
  readonly languageId: string;
  readonly text: string;
}

/** One `<link>` and what it resolved to. `resolved` is empty when it resolved to nothing. */
export interface ComponentPayload {
  readonly tag: string;
  readonly href: string;
  readonly resolved: string;
}

/** The three virtuals of a document with their text. */
export function virtualFilesPayload(document: CachedDocument): readonly VirtualFilePayload[] {
  return document.virtuals.map((virtual) => ({
    fileName: virtual.fileName,
    languageId: virtual.languageId,
    text: virtual.text,
  }));
}

/**
 * The close tag to insert at `offset`, or the empty string when none belongs there.
 *
 * Empty rather than `null` for the same reason the other two return `[]`: one shape on the
 * wire, and a client that does nothing with it either way.
 */
export function autoCloseTagPayload(document: CachedDocument, offset: number): string {
  return closingTagAt(document.source, document.html, offset) ?? '';
}

/**
 * Every `<link>` of a document, resolved.
 *
 * The layout is included: it is a link like any other, and a layout that does not resolve is the
 * same bug as a component that does not.
 */
export function componentRegistryPayload(
  document: CachedDocument,
  index: WorkspaceIndex,
): readonly ComponentPayload[] {
  const payload: ComponentPayload[] = [];

  for (const link of document.document.links) {
    const href = linkHref(link);
    if (href === undefined) continue;

    const entry = index.resolve(document.path, href);
    payload.push({ tag: entry?.tag ?? '', href, resolved: entry?.path ?? '' });
  }

  const layoutHref = layoutHrefOf(document.document);
  if (layoutHref !== '') {
    const entry = index.resolve(document.path, layoutHref);
    payload.push({ tag: '', href: layoutHref, resolved: entry?.path ?? '' });
  }
  return payload;
}
