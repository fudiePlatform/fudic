/**
 * The root `<template>` of a component, in the editor (BUG-42 §4.11).
 *
 * It is the element a component is DECLARED with (decision 75), and its attributes decide what
 * the component is: the shadow root the server writes, whether it delegates focus, where it
 * forwards references, and whether the component is a control-component. None of them was
 * offered or explained — the HTML service knows `<template>` from before declarative shadow DOM,
 * and `formassociated` is fudic's own word.
 *
 * Only the ROOT template of a COMPONENT: a nested `<template>` has no class to decide anything
 * about (`FUD0593`), and a page has no component at all.
 */

import { staticId, walkBlocks, type ElementNode, type Region, type Span } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import { nativeGapContextAt } from './position.js';

/** One attribute of the root template: its name, what accepting it writes, and its card. */
export interface TemplateAttribute {
  readonly name: string;
  /** A snippet: `$1` is where the caret lands. */
  readonly insertText: string;
  /** Whether accepting it asks for the next list: the ids, for the reference target. */
  readonly suggest: boolean;
  readonly hover: string;
}

/** The standard's four, the reference target, and fudic's marker — in the order they are written. */
export const TEMPLATE_ATTRIBUTES: readonly TemplateAttribute[] = [
  {
    name: 'shadowrootmode',
    insertText: 'shadowrootmode="open"',
    suggest: false,
    hover: '**`shadowrootmode`** · HTML\n\nAbre la raíz de sombra declarativa del componente: `open` o `closed`.',
  },
  {
    name: 'shadowrootdelegatesfocus',
    insertText: 'shadowrootdelegatesfocus',
    suggest: false,
    hover: '**`shadowrootdelegatesfocus`** · HTML\n\nEl foco que llega al host pasa al primer elemento enfocable de dentro.',
  },
  {
    name: 'shadowrootreferencetarget',
    insertText: 'shadowrootreferencetarget="$1"',
    suggest: true,
    hover:
      '**`shadowrootreferencetarget`** · HTML\n\nLo que apunta al host por id (un `<label for>`, un `aria-labelledby`) se reenvía al elemento de dentro con ese id.\n\nLo escribe el autor. En un control-componente, fudic lleva además a ese elemento lo que el puente no reenvía, y todo donde el navegador no tiene puente.',
  },
  {
    name: 'shadowrootclonable',
    insertText: 'shadowrootclonable',
    suggest: false,
    hover: '**`shadowrootclonable`** · HTML\n\nLa raíz de sombra se copia con `cloneNode` del host.',
  },
  {
    name: 'shadowrootserializable',
    insertText: 'shadowrootserializable',
    suggest: false,
    hover: '**`shadowrootserializable`** · HTML\n\nLa raíz de sombra sale en `getHTML({ serializableShadowRoots: true })`.',
  },
  {
    name: 'formassociated',
    insertText: 'formassociated',
    suggest: false,
    hover:
      '**`formassociated`** · fudic\n\nMarca un control-componente: un marcador de fudic, no del estándar, que fudic quiere proponer.\n\nDecide su clase (`FudicControlElement`), `delegatesFocus` y que se hidrate al cargar la página. El puente (`shadowrootreferencetarget`) es estándar y lo escribe el autor; fudic aporta el respaldo donde falta.',
  },
];

/** Whether this element is the root `<template>` of the component being edited. */
function isRootTemplate(cached: CachedDocument, el: ElementNode): boolean {
  return cached.document.type === 'component-document' && cached.document.template === el;
}

function carries(el: ElementNode, name: string): boolean {
  return el.attributes.some((a) => typeof a.name === 'string' && a.name.toLowerCase() === name);
}

/**
 * Whether the caret is at a gap of the root template. There the six attributes above are the
 * whole list: HTML's globals (`accesskey`, `aria-*`…) describe an element, and this one becomes a
 * shadow root, so the HTML service stays silent at this position.
 */
export function atRootTemplateGap(cached: CachedDocument, offset: number, region: Region): boolean {
  const gap = nativeGapContextAt(cached.source, offset, region);
  return gap !== undefined && isRootTemplate(cached, gap.element);
}

/** The attributes a gap in the root template offers: the ones it does not carry yet. */
export function templateAttributeOffers(cached: CachedDocument, el: ElementNode): readonly TemplateAttribute[] {
  if (!isRootTemplate(cached, el)) return [];
  return TEMPLATE_ATTRIBUTES.filter((attr) => !carries(el, attr.name));
}

/** The attribute of the root template whose NAME the cursor is on, with its card. */
export function templateAttributeAt(
  cached: CachedDocument,
  offset: number,
  region: Region,
): { readonly hover: string; readonly span: Span } | undefined {
  const { element, attribute } = region;
  if (region.kind !== 'tag' || element === undefined || attribute === undefined) return undefined;
  if (!isRootTemplate(cached, element) || typeof attribute.name !== 'string') return undefined;
  const known = TEMPLATE_ATTRIBUTES.find((attr) => attr.name === (attribute.name as string).toLowerCase());
  const end = attribute.span.start + attribute.name.length;
  if (known === undefined || offset > end) return undefined;
  return { hover: known.hover, span: { start: attribute.span.start, end } };
}

/**
 * The static ids of the root template, when the caret is inside its `shadowrootreferencetarget`
 * value — the only thing the bridge can point at (`FUD0605`). `undefined` anywhere else.
 */
export function referenceTargetIdsAt(cached: CachedDocument, region: Region): readonly string[] | undefined {
  const { element, attribute } = region;
  if (region.kind !== 'attr-value' || element === undefined || !isRootTemplate(cached, element)) return undefined;
  if (typeof attribute?.name !== 'string' || attribute.name.toLowerCase() !== 'shadowrootreferencetarget') {
    return undefined;
  }
  const ids: string[] = [];
  walkBlocks(element.children, (el) => {
    const id = staticId(el);
    if (typeof id === 'string' && id !== '') ids.push(id);
  });
  return ids;
}
