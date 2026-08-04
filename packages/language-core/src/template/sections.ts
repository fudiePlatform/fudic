/**
 * Sections and slots (SDD-23 §4.4).
 *
 *     @section nav { … }  →  $section<$L0>('nav'); …children…
 *     <slot>              →  $slot();
 *
 * `$section<T extends string>(name: T)` with `T` bound to the layout's `$Sections` union is
 * what makes a section the layout does not declare fail with `TS2345`, suggesting the names
 * that do exist — and what makes completion work right after `@section `, because at that
 * point TypeScript is completing a string-literal union.
 */

import type {
  AttributeValuePart,
  ElementNode,
  HtmlContent,
  SectionNode,
  Span,
  StructuredDocument,
} from '@fudic/compiler';
import { DIAGNOSTIC_ONLY_CAPS } from '../caps.js';
import { nestedContent, templateContent } from '../imports.js';
import type { VirtualWriter } from '../writer.js';
import type { TemplateContext } from './context.js';

export function emitSection(ctx: TemplateContext, node: SectionNode): void {
  // Without a layout there is no union to check against. `string` accepts any name rather
  // than inventing an error the file cannot be responsible for: a route with no layout link
  // already has its own diagnostic, and piling a second one on every section would bury it.
  ctx.w.scaffold(`$section<${ctx.aliases.layout ?? 'string'}>(`, node.keywordSpan);
  // The literal is ONE stretch standing for the bare name, quotes included, under the same
  // profile as a projected tag: the diagnostic must reach the source, nothing else may.
  //
  // TypeScript reports the `TS2345` over `'nav'` WITH its quotes, and a reported range only
  // maps back when BOTH its ends land in one stretch that carries `verification`. Written as
  // scaffold + copy + scaffold, the range began on mute scaffolding and the error reached
  // nobody — the projection produced the right error and the editor never showed it.
  ctx.w.projected(
    `'${ctx.source.slice(node.nameSpan.start, node.nameSpan.end)}'`,
    node.nameSpan,
    DIAGNOSTIC_ONLY_CAPS,
  );
  ctx.w.scaffold(');\n');
  ctx.emit(node.children);
}

/** `<slot>` — a marker inside the component. What its NAME means is `$Slots`, below. */
export function emitSlot(ctx: TemplateContext, at: SectionNode['span']): void {
  ctx.w.scaffold('$slot();\n', at);
}

/**
 * The slots a component declares, in source order, without duplicates (BUG-11 §4.3).
 *
 * Only a `<slot name="…">` counts. The default slot has no name to check anything against, so
 * a component with only a default slot declares nothing — which is what makes `slot=` on a
 * child of it an error, correctly.
 */
export function collectSlots(content: readonly HtmlContent[]): readonly NamedSlot[] {
  const found = new Map<string, NamedSlot>();
  walkSlots(content, found);
  return [...found.values()];
}

/** A `<slot name="meta">`, with the span of `meta` inside its quotes. */
export interface NamedSlot {
  readonly name: string;
  readonly span: Span;
}

function walkSlots(content: readonly HtmlContent[], out: Map<string, NamedSlot>): void {
  for (const node of content) {
    if (node.type !== 'element') {
      for (const nested of nestedContent(node)) walkSlots(nested, out);
      continue;
    }
    if (node.name === 'slot') {
      const named = nameOf(node);
      if (named !== undefined && !out.has(named.name)) out.set(named.name, named);
    }
    walkSlots(node.children, out);
  }
}

/**
 * The static `name` of a `<slot>`, or nothing.
 *
 * Static only, and on purpose: `name="@(x)"` is a slot whose identity is not known until it
 * runs, and putting it in a union of literals would be inventing a name the user did not write.
 */
function nameOf(element: ElementNode): NamedSlot | undefined {
  const attribute = element.attributes.find((a) => a.name === 'name');
  if (attribute === undefined) return undefined;

  // `value` is always an array — empty for `name` and for `name=""` (decision 44) — so an
  // empty or interpolated name simply yields nothing to declare.
  const only = attribute.value.length === 1 ? attribute.value[0] : undefined;
  if (only?.type !== 'attribute-text' || only.value === '') return undefined;

  return { name: only.value, span: only.span };
}

/**
 * The other half of the contract: what a component declares it can be filled with (BUG-11 §3.2).
 *
 *     <slot name="meta">  →  export type $Slots = 'meta';
 *
 * Each name is copied from its `<slot>`, so go-to-definition on a `slot=` in a consumer lands
 * on the very element that will host it — the same trick `$Sections` plays with its layout.
 *
 * `never` for everything else. A page, a route and a layout have no shadow root, so exporting
 * a slot union from one would invite a `slot=` against something that cannot host it.
 */
export function emitSlotsContract(w: VirtualWriter, doc: StructuredDocument): void {
  const slots = doc.type === 'component-document' ? collectSlots(templateContent(doc)) : [];
  if (slots.length === 0) {
    w.scaffold('export type $Slots = never;\n');
    return;
  }

  w.scaffold('export type $Slots = ');
  slots.forEach((slot, i) => {
    if (i > 0) w.scaffold(' | ');
    w.scaffold("'");
    w.copy(slot.span);
    w.scaffold("'");
  });
  w.scaffold(';\n');
}

/**
 * The other half of the contract: what a layout declares it renders (§3.2).
 *
 *     @RenderSection(nav)  →  export type $Sections = 'nav';
 *
 * Each name is copied from its `@RenderSection`, so go-to-definition on a section name in a
 * route lands on the directive in the layout that consumes it.
 *
 * `never` for everything else — a file that is not a layout renders no section, and a route
 * that names one against it must fail on the name (`TS2345`), not on the import.
 */
export function emitSectionsContract(
  w: VirtualWriter,
  doc: StructuredDocument,
): void {
  const names = doc.type === 'layout-document' ? doc.renderSections : [];
  if (names.length === 0) {
    w.scaffold('export type $Sections = never;\n');
    return;
  }

  w.scaffold('export type $Sections = ');
  names.forEach((section, i) => {
    if (i > 0) w.scaffold(' | ');
    w.scaffold("'");
    w.copy(section.nameSpan);
    w.scaffold("'");
  });
  w.scaffold(';\n');
}
