/**
 * The contract between a route and the holes of its layout (SDD-48).
 *
 * Two facts that need BOTH files, so neither structuring pass can see them — only whoever
 * holds the pair: `resolveDocument` in the build, the workspace index in the editor. Pure
 * over the two documents, with no filesystem, so both call the same function.
 *
 *   `FUD0890`  a `@RenderSection(x, required: true)` the route does not fill. Over the
 *              route's `<link rel="layout">`, where it declares the relation — the same
 *              anchor as a required layout prop (`FUD0702`), and the one the bulb repairs.
 *   `FUD0891`  text at the root of a hole the layout slots. `slot="x"` is an attribute, so
 *              only an element can carry it: a text node there falls into the component's
 *              DEFAULT slot, somewhere the author never put it.
 *   `FUD0892`  an element at the root of a slotted hole that writes its own `slot=`. The
 *              layout already names the slot, and one element cannot fill two.
 */

import type { Diagnostic, Span } from '../types/index.js';
import { FUD0890, FUD0891, FUD0892 } from '@fudic/diagnostics';
import type { ElementNode, HtmlContent, RawExpressionNode } from '../html/index.js';
import type { ControlNode } from '../control/index.js';
import type { LayoutDocument, RouteDocument } from '../document/index.js';
import type { RenderSectionNode } from './nodes.js';

/**
 * What a route needs to know about its layout's holes: where the body goes and which
 * sections it renders. A `LayoutDocument` is one; the editor's index keeps just this.
 */
export type LayoutHoles = Pick<LayoutDocument, 'renderBody' | 'renderSections'>;

/** The `required: true` sections of `layout` that `route` does not declare, in layout order. */
export function missingRequiredSections(
  route: RouteDocument,
  layout: LayoutHoles,
): readonly RenderSectionNode[] {
  const declared = new Set(route.sections.map((s) => s.name));
  return layout.renderSections.filter((rs) => rs.required && rs.name !== '' && !declared.has(rs.name));
}

/** Every diagnostic of the contract between `route` and its `layout`. */
export function holeContractDiagnostics(
  route: RouteDocument,
  layout: LayoutHoles,
): readonly Diagnostic[] {
  const out: Diagnostic[] = [];
  const missing = missingRequiredSections(route, layout);
  if (missing.length > 0) {
    out.push(FUD0890({ span: route.layoutLink.openSpan, names: missing.map((s) => s.name) }));
  }

  const bodySlot = layout.renderBody?.slot?.name;
  if (bodySlot !== undefined) slottedRoots(route.markup, bodySlot, out);
  const sectionSlots = new Map<string, string>();
  for (const rs of layout.renderSections) {
    if (rs.slot !== undefined) sectionSlots.set(rs.name, rs.slot.name);
  }
  for (const section of route.sections) {
    const slot = sectionSlots.get(section.name);
    if (slot !== undefined) slottedRoots(section.children, slot, out);
  }
  return out;
}

/** The roots of a hole that goes into `slot`: text and a second `slot=` are what break it. */
function slottedRoots(content: readonly HtmlContent[], slot: string, out: Diagnostic[]): void {
  for (const node of content) {
    switch (node.type) {
      case 'element':
        ownSlot(node, slot, out);
        break;
      case 'text':
        if (node.value.trim() !== '') textAtRoot(node.span, slot, out);
        break;
      case 'razor-expression':
        textAtRoot(node.span, slot, out);
        break;
      case 'raw-expression':
        textAtRoot((node as RawExpressionNode).span, slot, out);
        break;
      case 'if':
      case 'switch':
      case 'foreach':
      case 'for':
      case 'while':
        // A construct is transparent: what its branches write lands at the root all the same.
        for (const body of bodiesOf(node as unknown as ControlNode)) slottedRoots(body, slot, out);
        break;
      default:
        // Comments, `@render` in an unexpanded file, anything else: nothing to say here.
        break;
    }
  }
}

function textAtRoot(at: Span, slot: string, out: Diagnostic[]): void {
  out.push(FUD0891({ span: at, slot }));
}

function ownSlot(el: ElementNode, slot: string, out: Diagnostic[]): void {
  const own = el.attributes.find((a) => a.name === 'slot');
  if (own === undefined) return;
  out.push(FUD0892({ span: own.span, slot }));
}

/** The bodies of a construct, whichever of the three shapes it has. */
function bodiesOf(node: ControlNode): readonly (readonly HtmlContent[])[] {
  if (node.type === 'if') {
    const bodies = node.branches.map((b) => b.body);
    return node.elseBody === undefined ? bodies : [...bodies, node.elseBody];
  }
  if (node.type === 'switch') return node.cases.map((c) => c.body);
  return [node.body];
}
