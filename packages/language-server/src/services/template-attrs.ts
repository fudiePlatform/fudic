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

import {
  ADOPTED_STYLESHEETS_ATTR,
  adoptedStylesOf,
  guideAdoptionDiagnostics,
  piecesForTag,
  staticId,
  templateSurface,
  walkBlocks,
  type Diagnostic,
  type ElementNode,
  type GuidePiece,
  type Region,
  type Span,
} from '@fudic/compiler';
import { FUD0744 } from '@fudic/diagnostics';
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
    hover: '**`shadowrootmode`** · HTML\n\nOpens the declarative shadow root of the component: `open` or `closed`.',
  },
  {
    name: 'shadowrootdelegatesfocus',
    insertText: 'shadowrootdelegatesfocus',
    suggest: false,
    hover: '**`shadowrootdelegatesfocus`** · HTML\n\nFocus that reaches the host moves to the first focusable element inside.',
  },
  {
    name: 'shadowrootreferencetarget',
    insertText: 'shadowrootreferencetarget="$1"',
    suggest: true,
    hover:
      '**`shadowrootreferencetarget`** · HTML\n\nWhat points to the host by id (a `<label for>`, an `aria-labelledby`) is forwarded to the element inside with that id.\n\nThe author writes it. In a control component, fudic also brings to that element what the bridge does not forward, and everything where the browser has no bridge.',
  },
  {
    name: 'shadowrootadoptedstylesheets',
    insertText: 'shadowrootadoptedstylesheets="$1"',
    suggest: true,
    hover:
      '**`shadowrootadoptedstylesheets`** · HTML\n\nThe sheets this component picks by name from the `styles` of its `fudic.json`, separated by spaces.\n\nThey are adopted after the `globalStyles` and before its own `<style>`, in the order they are written.',
  },
  {
    name: 'shadowrootclonable',
    insertText: 'shadowrootclonable',
    suggest: false,
    hover: '**`shadowrootclonable`** · HTML\n\nThe shadow root is copied by `cloneNode` on the host.',
  },
  {
    name: 'shadowrootserializable',
    insertText: 'shadowrootserializable',
    suggest: false,
    hover: '**`shadowrootserializable`** · HTML\n\nThe shadow root is included in `getHTML({ serializableShadowRoots: true })`.',
  },
  {
    name: 'formassociated',
    insertText: 'formassociated',
    suggest: false,
    hover:
      '**`formassociated`** · fudic\n\nMarks a control component: a fudic marker, not part of the standard, that fudic means to propose.\n\nIt decides its class (`FudicControlElement`), `delegatesFocus` and that it hydrates when the page loads. The bridge (`shadowrootreferencetarget`) is standard and the author writes it; fudic supplies the fallback where it is missing.',
  },
];

/**
 * `FUD0744`: every name the root template chooses that its project's `styles` does not
 * declare. The build reports the same thing; here it is underlined as it is typed.
 */
export function adoptedStyleDiagnostics(
  cached: CachedDocument,
  choosable: readonly string[],
): readonly Diagnostic[] {
  if (cached.document.type !== 'component-document') return [];
  const known = new Set(choosable);
  return adoptedStylesOf(cached.document.template)
    .names.filter(({ name }) => !known.has(name))
    .map(({ name, span }) => FUD0744({ span, name, choosable }));
}

/**
 * `FUD1440`/`FUD1441`: the pieces of the style guide the template needs and does not adopt,
 * and the adopted ones that style nothing in it — the function the build calls. The editor
 * holds the file and not its snippets expanded, so a template that renders one is not judged
 * unused: what the snippet writes is not in sight.
 */
export function guidePieceDiagnostics(cached: CachedDocument, pieces: readonly GuidePiece[]): readonly Diagnostic[] {
  if (cached.document.type !== 'component-document') return [];
  const template = cached.document.template;
  if (template === undefined) return [];
  const text = cached.source.slice(template.span.start, template.span.end);
  const surface = /@render\b/u.test(text) ? null : templateSurface(template.children);
  return guideAdoptionDiagnostics(template, pieces, surface);
}

/**
 * What writing `<tag>` at `offset` adds to the root template: the guide's pieces that style the
 * tag and the attribute does not name yet, at the end of `shadowrootadoptedstylesheets` — or the
 * attribute itself when there is none. `undefined` outside the root template of a component,
 * for a tag no piece styles, when every piece is named, and when the value is an expression
 * (`FUD0745`): nothing is added where it cannot be added cleanly.
 */
export function adoptionEditFor(
  cached: CachedDocument,
  offset: number,
  tag: string,
  pieces: readonly GuidePiece[],
): { readonly span: Span; readonly newText: string } | undefined {
  if (cached.document.type !== 'component-document') return undefined;
  const template = cached.document.template;
  if (template === undefined || offset < template.openSpan.end || offset > template.span.end) return undefined;
  const written = adoptedStylesOf(template);
  if (written.problems.length > 0) return undefined;
  const named = new Set(written.names.map((n) => n.name));
  const missing = piecesForTag(pieces, tag).filter((name) => !named.has(name));
  if (missing.length === 0) return undefined;
  const attr = template.attributes.find(
    (a) => typeof a.name === 'string' && a.name.toLowerCase() === ADOPTED_STYLESHEETS_ATTR,
  );
  if (attr === undefined) {
    const at = template.openSpan.end - 1;
    return { span: { start: at, end: at }, newText: ` ${ADOPTED_STYLESHEETS_ATTR}="${missing.join(' ')}"` };
  }
  const last = attr.value[attr.value.length - 1];
  if (last === undefined) {
    // Bare or empty (`=""`): there is no text to append to, so the attribute is written whole.
    return { span: attr.span, newText: `${ADOPTED_STYLESHEETS_ATTR}="${missing.join(' ')}"` };
  }
  const at = last.span.end;
  const gap = /\S$/u.test(cached.source.slice(last.span.start, at)) ? ' ' : '';
  return { span: { start: at, end: at }, newText: `${gap}${missing.join(' ')}` };
}

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
 * The names already written, when the caret is inside the `shadowrootadoptedstylesheets` value
 * of the root template — so the list offers the ones missing. `undefined` anywhere else.
 */
export function adoptedStylesAt(cached: CachedDocument, region: Region): readonly string[] | undefined {
  const { element, attribute } = region;
  if (region.kind !== 'attr-value' || element === undefined || !isRootTemplate(cached, element)) return undefined;
  if (typeof attribute?.name !== 'string' || attribute.name.toLowerCase() !== ADOPTED_STYLESHEETS_ATTR) {
    return undefined;
  }
  return adoptedStylesOf(element).names.map((written) => written.name);
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
