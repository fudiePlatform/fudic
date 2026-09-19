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

import {
  linkHref,
  readSnippetLink,
  type ElementNode,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';
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
    const href = readSnippetLink(link).href;
    if (href === '') continue;
    const namespace = namespaceOf(link);
    snippets.push({ href, ...(namespace === undefined ? {} : { namespace }) });
  }

  return {
    component: (tag) => byTag.get(tag),
    layout: () => (layout === '' ? undefined : layout),
    snippets: () => snippets,
  };
}

/**
 * The `as` of a link, with the span of the VALUE so hovering the namespace in a `@render`
 * has somewhere to land.
 *
 * It reads the name here rather than taking the one `readSnippetLink` already returned, and
 * that is the point: taking both would be two sources for one fact, and the arithmetic that
 * joined them had to guard against a name with no attribute and an attribute with no parts —
 * two states the reader cannot produce, so two branches nothing could ever reach. Read once,
 * and the name and its span are either both there or both absent, by construction.
 *
 * The rule is the compiler's, not a second one: an `as` whose value is not static is no
 * namespace (a dynamic one names nothing at compile time), and neither is an empty one.
 */
function namespaceOf(link: ElementNode): { readonly name: string; readonly span: Span } | undefined {
  for (const attribute of link.attributes) {
    if (attribute.name !== 'as') continue;
    const parts = attribute.value;
    let name = '';
    for (const part of parts) {
      if (part.type !== 'attribute-text') return undefined;
      name += part.value;
    }
    // `as` bare or `as=""`: the global scope, which is what no `as` at all means.
    if (name === '') return undefined;
    return { name, span: { start: parts[0]!.span.start, end: parts[parts.length - 1]!.span.end } };
  }
  return undefined;
}
