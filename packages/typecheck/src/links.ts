/**
 * The `<link>`s a file declares, as the rules and the editor read them (SDD-24 §4.2).
 */

import type { Attribute, ElementNode, StructuredDocument } from '@fudic/compiler';

/** A `<link>` of this file and what it links. */
export interface LinkRef {
  readonly element: ElementNode;
  readonly rel: 'component' | 'layout' | 'snippet';
}

/** Every `<link>` this file declares: the components, plus the layout when it has one. */
export function linksOf(document: StructuredDocument): readonly LinkRef[] {
  const links: LinkRef[] = document.links.map((element) => ({ element, rel: 'component' as const }));

  // The snippet imports (SDD-29 §4.3), which need the same two things a component link does:
  // the paths completed as they are typed, and a diagnostic when the file is not there.
  for (const element of document.snippetLinks) links.push({ element, rel: 'snippet' });

  if (document.type === 'route-document') {
    links.push({ element: document.layoutLink, rel: 'layout' });
  } else if (document.type === 'layout-document' && document.layoutLink !== undefined) {
    links.push({ element: document.layoutLink, rel: 'layout' });
  }
  return links;
}

/** The attribute of this name, if the element has one. */
export function attributeOf(element: ElementNode, name: string): Attribute | undefined {
  return element.attributes.find((attribute) => attribute.name === name);
}
