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

import type { SectionNode, StructuredDocument } from '@fudic/compiler';
import type { VirtualWriter } from '../writer.js';
import type { TemplateContext } from './context.js';

export function emitSection(ctx: TemplateContext, node: SectionNode): void {
  // Without a layout there is no union to check against. `string` accepts any name rather
  // than inventing an error the file cannot be responsible for: a route with no layout link
  // already has its own diagnostic, and piling a second one on every section would bury it.
  ctx.w.scaffold(`$section<${ctx.aliases.layout ?? 'string'}>('`, node.keywordSpan);
  ctx.w.copy(node.nameSpan);
  ctx.w.scaffold("');\n");
  ctx.emit(node.children);
}

/** `<slot>` — a marker with no type of its own, for now (SDD-23 §7). */
export function emitSlot(ctx: TemplateContext, at: SectionNode['span']): void {
  ctx.w.scaffold('$slot();\n', at);
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
