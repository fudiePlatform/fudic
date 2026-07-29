/**
 * The `FileRegistry` of SDD-23, implemented against the workspace index (SDD-24 §2, §4.5).
 *
 * SDD-23 refuses to touch the filesystem, and the `ComponentRegistry` of SDD-12 only answers
 * yes/no, so this is the seam where a tag becomes a path. It resolves the `<link>`s of ONE
 * file — never transitively — which is what keeps it a map lookup per document version.
 *
 * The value returned for a tag is the `href` **as the user wrote it**, not the absolute path:
 * the virtual file imports it verbatim so that TypeScript resolves what the editor shows.
 */

import { linkHref, type StructuredDocument } from '@fudic/compiler';
import type { FileRegistry } from '@fudic/language-core';
import type { WorkspaceIndex } from './workspace-index.js';
import { layoutHrefOf } from './mode.js';

/** The registry of one `.fud`: its own `<link>`s resolved against the index. */
export function createFileRegistry(
  filePath: string,
  document: StructuredDocument,
  index: WorkspaceIndex,
): FileRegistry {
  const byTag = new Map<string, string>();

  for (const link of document.links) {
    const href = linkHref(link);
    if (href === undefined) continue;
    const target = index.resolve(filePath, href);
    // A tag with no entry stays unresolved on purpose: SDD-23 projects it as an undeclared
    // type name so the checker reports it, and FUD0460 covers the href itself.
    if (target !== undefined && target.tag !== '') byTag.set(target.tag, href);
  }

  const layout = layoutHrefOf(document);

  return {
    component: (tag) => byTag.get(tag),
    layout: () => (layout === '' ? undefined : layout),
  };
}
