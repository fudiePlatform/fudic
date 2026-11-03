/**
 * The `FileRegistry` of SDD-23, implemented against a link index (SDD-24 §2, §4.5): the
 * editor's workspace index or the build's project index, through the same narrow port.
 *
 * SDD-23 refuses to touch the filesystem, and the `ComponentRegistry` of SDD-12 only answers
 * yes/no, so this is the seam where a tag becomes a path. It resolves the `<link>`s of ONE
 * file — never transitively — which is what keeps it a map lookup per document version.
 *
 * The value returned for a tag is the `href` **as the user wrote it**, not the absolute path:
 * the virtual file imports it verbatim so that TypeScript resolves what the editor shows.
 */

import {
  documentRoots,
  isComponentLink,
  linkHref,
  readSnippetLink,
  walk,
  type ElementNode,
  type Span,
  type StructuredDocument,
} from '@fudic/compiler';
import type { FileRegistry, ServerImport, SnippetImport } from '@fudic/language-core';
import type { LinkIndex } from './link-index.js';
import { serverLinksOf } from './links.js';
import { layoutHrefOf } from './mode.js';

/** The registry of a file of a project: it always knows the `.fudapi` the file links. */
export type ProjectRegistry = FileRegistry & { servers(): readonly ServerImport[] };

/** The registry of one `.fud`: its own `<link>`s resolved against the index. */
export function createFileRegistry(
  filePath: string,
  document: StructuredDocument,
  index: LinkIndex,
): ProjectRegistry {
  const byTag = new Map<string, string>();
  let broken: string | undefined;

  // The links the structure rejected (`FUD0152`, `FUD0438`) resolve too: the build ignores them,
  // and that is the one thing their diagnostic says. Leaving their tag undeclared would say it
  // again as `FUD0191` and as a type error on every use.
  for (const link of [...document.links, ...strayComponentLinks(document)]) {
    const href = linkHref(link);
    if (href === undefined) continue;
    const target = index.resolve(filePath, href);
    // A link that points at nothing (`FUD0460`) may be the one a tag of this file was meant to
    // come from: until it is fixed, an unresolved tag is that link's, so the link's diagnostic is
    // the only voice. Once it is, a tag nobody declares is `FUD0191` again.
    if (target === undefined) broken ??= href;
    else if (target.tag !== '') byTag.set(target.tag, href);
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

  // The `.fudapi` it links (SDD-60 §4.7), read when the projection asks.
  const serverLinks = serverLinksOf(document);
  const servers = (): readonly ServerImport[] =>
    serverLinks.flatMap((link) => {
      const href = linkHref(link);
      const read = href === undefined ? undefined : index.server?.(filePath, href);
      return read === undefined ? [] : [read];
    });

  return {
    component: (tag) => byTag.get(tag) ?? broken,
    layout: () => (layout === '' ? undefined : layout),
    snippets: () => snippets,
    servers,
  };
}

/** Every `<link rel="component">` of the tree that is not one of the document's own. */
function strayComponentLinks(document: StructuredDocument): readonly ElementNode[] {
  const own = new Set(document.links);
  const stray: ElementNode[] = [];
  walk(documentRoots(document), {
    element(el) {
      if (isComponentLink(el) && !own.has(el)) stray.push(el);
    },
  });
  return stray;
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
