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

import { linkHref, readSnippetLink, type Span, type StructuredDocument } from '@fudic/compiler';
import type { FileRegistry, SnippetImport } from '@fudic/language-core';
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

  // The snippet imports, in source order and by FILE (SDD-29 §4.3): an import brings in every
  // declaration of the file it names, so there is nothing here to resolve by name. The `href`
  // travels as written, like a component's, so TypeScript resolves what the editor shows.
  const snippets: SnippetImport[] = [];
  for (const link of document.snippetLinks) {
    const read = readSnippetLink(link);
    if (read.href === '') continue;
    const namespace = namespaceOf(link, read.namespace);
    snippets.push({ href: read.href, ...(namespace === undefined ? {} : { namespace }) });
  }

  return {
    component: (tag) => byTag.get(tag),
    layout: () => (layout === '' ? undefined : layout),
    snippets: () => snippets,
  };
}

/**
 * The `as` of a link, with the span of the VALUE so hovering the namespace in a `@render`
 * has somewhere to land. Its own function because an attribute's value is a list of parts
 * and the span that matters is the run they cover, not the attribute's.
 */
function namespaceOf(
  link: { readonly attributes: readonly { name: unknown; value: readonly { span: Span }[] }[] },
  name: string | undefined,
): { readonly name: string; readonly span: Span } | undefined {
  if (name === undefined) return undefined;
  for (const attribute of link.attributes) {
    if (attribute.name !== 'as') continue;
    const first = attribute.value[0];
    const last = attribute.value[attribute.value.length - 1];
    if (first === undefined || last === undefined) return undefined;
    return { name, span: { start: first.span.start, end: last.span.end } };
  }
  return undefined;
}
