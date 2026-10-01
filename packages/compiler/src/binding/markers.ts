/**
 * Which element speaks for which bound node — the `error="@f.title"` and `summary="@f"` markers
 * of a template, paired with the `control` they describe (decisions 130 and 131, BUG-41 §3.3,
 * BUG-42 §3.3).
 *
 * ONE function, read by the two places that must agree: the semantic pass reports what cannot
 * be paired (`FUD0597`–`FUD0602`), and the emit writes `id`, `aria-describedby` and the bind
 * call off the pairs. A rule the analyzer and the emit each wrote their own way is how a file
 * compiles clean and still ships a reference that points at nothing.
 *
 * **A pair lives in one BLOCK.** An `@if` branch, a `@switch` case, a loop body, a section or a
 * snippet is a block; an element's children are in its own block. The reason is the client
 * emit, where each block is its own walk with its own node variables: the bind call names the
 * bound element AND its marker, so both have to be variables of the same closure. Across two
 * blocks there is no place where both exist at once.
 *
 * **Two attributes, one meaning each** (decision 131). `error` names a CONTROL and speaks as
 * text; `summary` names a form or a group and speaks as a list. What the node IS cannot be told
 * by its type — a root form and a group have the same shape — so it is told here, by the element
 * that binds it: `FUD0600` and `FUD0601`, once, for the build and for the editor.
 */

import type { Diagnostic } from '../types/index.js';
import { FUD0597, FUD0598, FUD0599, FUD0600, FUD0601, FUD0602 } from '@fudic/diagnostics';
import type { Attribute, ElementNode, HtmlContent } from '../html/index.js';
import type { ForeachNode, ForNode, IfNode, SwitchNode, WhileNode } from '../control/index.js';
import type { SectionNode } from '../layout/index.js';
import type { SnippetDeclNode } from '../snippet/index.js';
import { classifyAttribute } from './classify.js';
import { controlTarget } from './control.js';
import { FIELDS_NAME, SUMMARY_NAME, type MarkerName } from './nodes.js';

/**
 * What a marker speaks for: a value's error, a form's or a group's summary, or the error of a
 * control that crosses into a control-component (BUG-42 §4.9) — whose input the child binds.
 */
export type MarkerKind = 'value' | 'form' | 'group' | 'crossing';

/** One marker, paired. */
export interface Marker {
  /** The node it names, sliced from the source: `f.title`. */
  readonly node: string;
  readonly kind: MarkerKind;
  /** Which attribute made it a marker. */
  readonly attr: MarkerName;
  /** A summary that also lists the errors of the fields (`fields`, decision 131). */
  readonly fields: boolean;
  /** The author's own static `id`, or `null` when the compiler has to write one. */
  readonly id: string | null;
}

/**
 * Something about a marker that cannot be emitted, for the semantic pass to report: one of
 * `FUD0597`–`FUD0602`, already built.
 */
export type MarkerProblem = Diagnostic;

export interface MarkerPairing {
  /** Every marker that pairs, keyed by its element. */
  readonly markers: ReadonlyMap<ElementNode, Marker>;
  /**
   * Every bound element that has a marker, keyed by the element — radios of a group included,
   * and the host of a control-component a marker describes from outside.
   */
  readonly describedBy: ReadonlyMap<ElementNode, ElementNode>;
  readonly problems: readonly MarkerProblem[];
}

/**
 * The elements a summary cannot hold a list in: a `<ul>` inside them is invalid HTML
 * (`FUD0602`). Phrasing content, the interactive ones, headings and a `<legend>`.
 */
const NO_LIST: ReadonlySet<string> = new Set([
  'p', 'span', 'small', 'label', 'a', 'button', 'strong', 'em', 'b', 'i',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'legend',
]);

/** One element carrying a binding, with where it sits. */
interface Seen {
  readonly el: ElementNode;
  readonly attr: Attribute;
  readonly name: MarkerName | 'control';
  readonly node: string;
  readonly block: object;
  readonly inLoop: boolean;
}

/**
 * Pair the markers of `roots` with their bound elements.
 *
 * `isComponent` is injected for `controlTarget`'s reason: who is a declared component tag is
 * graph knowledge, and this module holds no graph. So is `isFormAssociated`, which says whether
 * a component tag is a control-component — `undefined` when it cannot be known, and then a
 * marker beside it is neither paired nor blamed.
 */
export function pairMarkers(
  source: string,
  roots: readonly HtmlContent[],
  isComponent: (tag: string) => boolean,
  isFormAssociated: (tag: string) => boolean | undefined,
): MarkerPairing {
  const bound: Seen[] = [];
  const marked: Seen[] = [];
  walkBlocks(roots, (el, block, inLoop) => {
    for (const attr of el.attributes) {
      const binding = classifyAttribute(attr, source).value;
      if (binding.type !== 'control' && binding.type !== 'error') continue;
      const node = source.slice(binding.value.expr.start, binding.value.expr.end).trim();
      const name = binding.type === 'control' ? 'control' : binding.name;
      (binding.type === 'control' ? bound : marked).push({ el, attr, name, node, block, inLoop });
    }
  });

  const markers = new Map<ElementNode, Marker>();
  const describedBy = new Map<ElementNode, ElementNode>();
  const problems: MarkerProblem[] = [];
  const named = new Set<string>();

  for (const m of marked) {
    const attr = m.name as MarkerName;
    const span = m.attr.span;
    if (m.inLoop) {
      problems.push(FUD0598({ span, reason: 'loop', attr, node: m.node }));
      continue;
    }
    if (named.has(m.node)) {
      problems.push(FUD0598({ span, reason: 'second', node: m.node }));
      continue;
    }
    named.add(m.node);

    const id = staticId(m.el);
    if (id === undefined || hasContent(m.el)) {
      problems.push(FUD0599({ span, attr }));
      continue;
    }
    if (attr === SUMMARY_NAME && NO_LIST.has(m.el.name.toLowerCase())) {
      problems.push(FUD0602({ span, element: m.el.name }));
      continue;
    }

    let unknown = false;
    const targets = bound.flatMap((b) => {
      if (b.node !== m.node || b.block !== m.block) return [];
      const target = controlTarget(b.el, isComponent(b.el.name));
      if (target.kind === 'value' || target.kind === 'form' || target.kind === 'group') {
        return [{ el: b.el, kind: target.kind as MarkerKind }];
      }
      if (target.kind !== 'component') return [];
      // A control-component edits the node in ITS tree, and the relay carries the description
      // of its host to its input (BUG-42 §4.8). Any other component has no input to carry it to.
      const associated = isFormAssociated(target.tag);
      if (associated === undefined) unknown = true;
      return associated === true ? [{ el: b.el, kind: 'crossing' as MarkerKind }] : [];
    });
    const first = targets[0];
    if (first === undefined) {
      if (!unknown) problems.push(FUD0597({ span, node: m.node }));
      continue;
    }
    const kind = first.kind;
    const summarising = kind === 'form' || kind === 'group';
    if (attr !== SUMMARY_NAME && summarising) {
      problems.push(FUD0600({ span, node: m.node, kind }));
      continue;
    }
    if (attr === SUMMARY_NAME && !summarising) {
      problems.push(FUD0601({ span, node: m.node }));
      continue;
    }
    markers.set(m.el, { node: m.node, kind: first.kind, attr, fields: attr === SUMMARY_NAME && hasFields(m.el), id });
    for (const t of targets) describedBy.set(t.el, m.el);
  }

  return { markers, describedBy, problems };
}

/** Whether an element carries the bare `fields` of a summary. */
export function hasFields(el: ElementNode): boolean {
  return el.attributes.some((a) => typeof a.name === 'string' && a.name.toLowerCase() === FIELDS_NAME);
}

/**
 * Whether `attr` is the `fields` of a summary, which the compiler consumes and never writes
 * into the HTML (decision 131). On an element without `summary=` it is the author's attribute.
 */
export function isSummaryFields(el: ElementNode, attr: Attribute): boolean {
  return (
    typeof attr.name === 'string' &&
    attr.name.toLowerCase() === FIELDS_NAME &&
    el.attributes.some((a) => typeof a.name === 'string' && a.name.toLowerCase() === SUMMARY_NAME)
  );
}

/**
 * An element's own `id`: its text when static, `null` when it wrote none, `undefined` when it
 * wrote one the compiler cannot read — an `@` in it.
 */
export function staticId(el: ElementNode): string | null | undefined {
  const attr = idAttribute(el);
  if (attr === undefined) return null;
  let text = '';
  for (const part of attr.value) {
    if (part.type !== 'attribute-text') return undefined;
    text += part.value;
  }
  return text;
}

/** The `id` attribute of an element, if it wrote one. */
export function idAttribute(el: ElementNode): Attribute | undefined {
  return el.attributes.find((a) => typeof a.name === 'string' && a.name.toLowerCase() === 'id');
}

/** Whether the author wrote anything inside the marker that the runtime would overwrite. */
function hasContent(el: ElementNode): boolean {
  return el.children.some((c) => c.type !== 'text' || c.value.trim() !== '');
}

/** What a walk of the blocks tells each element about where it sits. */
export type BlockVisitor = (
  el: ElementNode,
  block: object,
  inLoop: boolean,
  ancestors: readonly ElementNode[],
) => void;

/**
 * Depth-first over the elements, telling each one which block it is in, whether a loop encloses
 * it and which elements enclose it. A block is identified by its content list, which is unique
 * per branch.
 */
export function walkBlocks(roots: readonly HtmlContent[], visit: BlockVisitor): void {
  walk(roots, roots, false, [], visit);
}

function walk(
  nodes: readonly HtmlContent[],
  block: object,
  inLoop: boolean,
  ancestors: readonly ElementNode[],
  visit: BlockVisitor,
): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'element': {
        const el = node as ElementNode;
        visit(el, block, inLoop, ancestors);
        walk(el.children, block, inLoop, [...ancestors, el], visit);
        break;
      }
      case 'if': {
        const ifNode = node as unknown as IfNode;
        for (const branch of ifNode.branches) walk(branch.body, branch.body, inLoop, ancestors, visit);
        if (ifNode.elseBody) walk(ifNode.elseBody, ifNode.elseBody, inLoop, ancestors, visit);
        break;
      }
      case 'switch':
        for (const branch of (node as unknown as SwitchNode).cases) {
          walk(branch.body, branch.body, inLoop, ancestors, visit);
        }
        break;
      case 'foreach':
      case 'for':
      case 'while': {
        const body = (node as unknown as ForeachNode | ForNode | WhileNode).body;
        walk(body, body, true, ancestors, visit);
        break;
      }
      case 'section':
      case 'snippet': {
        const children = (node as unknown as SectionNode | SnippetDeclNode).children;
        walk(children, children, inLoop, ancestors, visit);
        break;
      }
      default:
        break;
    }
  }
}
