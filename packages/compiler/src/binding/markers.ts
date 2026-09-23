/**
 * Which element speaks for which bound node — the `error="@f.title"` markers of a template,
 * paired with the `control` they describe (decision 130, BUG-41 §3.3).
 *
 * ONE function, read by the two places that must agree: the semantic pass reports what cannot
 * be paired (`FUD0597`–`FUD0599`), and the emit writes `id`, `aria-describedby` and the bind
 * call off the pairs. A rule the analyzer and the emit each wrote their own way is how a file
 * compiles clean and still ships a reference that points at nothing.
 *
 * **A pair lives in one BLOCK.** An `@if` branch, a `@switch` case, a loop body, a section or a
 * snippet is a block; an element's children are in its own block. The reason is the client
 * emit, where each block is its own walk with its own node variables: the bind call names the
 * bound element AND its marker, so both have to be variables of the same closure. Across two
 * blocks there is no place where both exist at once.
 */

import type { Span } from '../types/index.js';
import type { Attribute, ElementNode, HtmlContent } from '../html/index.js';
import type { ForeachNode, ForNode, IfNode, SwitchNode, WhileNode } from '../control/index.js';
import type { SectionNode } from '../layout/index.js';
import type { SnippetDeclNode } from '../snippet/index.js';
import { classifyAttribute } from './classify.js';
import { controlTarget } from './control.js';

/** What a marker speaks for: a value's error, or a form's or a group's summary. */
export type MarkerKind = 'value' | 'form' | 'group';

/** One marker, paired. */
export interface Marker {
  /** The node it names, sliced from the source: `f.title`. */
  readonly node: string;
  readonly kind: MarkerKind;
  /** The author's own static `id`, or `null` when the compiler has to write one. */
  readonly id: string | null;
}

/** Something about a marker that cannot be emitted, for the semantic pass to report. */
export interface MarkerProblem {
  readonly code: 'FUD0597' | 'FUD0598' | 'FUD0599';
  readonly message: string;
  readonly span: Span;
}

export interface MarkerPairing {
  /** Every marker that pairs, keyed by its element. */
  readonly markers: ReadonlyMap<ElementNode, Marker>;
  /** Every bound element that has a marker, keyed by the element — radios of a group included. */
  readonly describedBy: ReadonlyMap<ElementNode, ElementNode>;
  readonly problems: readonly MarkerProblem[];
}

/** One element carrying a binding, with where it sits. */
interface Seen {
  readonly el: ElementNode;
  readonly attr: Attribute;
  readonly node: string;
  readonly block: object;
  readonly inLoop: boolean;
}

/**
 * Pair the markers of `roots` with their bound elements.
 *
 * `isComponent` is injected for `controlTarget`'s reason: who is a declared component tag is
 * graph knowledge, and this module holds no graph.
 */
export function pairMarkers(
  source: string,
  roots: readonly HtmlContent[],
  isComponent: (tag: string) => boolean,
): MarkerPairing {
  const bound: Seen[] = [];
  const marked: Seen[] = [];
  walkBlocks(roots, roots, false, (el, block, inLoop) => {
    for (const attr of el.attributes) {
      const binding = classifyAttribute(attr, source).value;
      if (binding.type !== 'control' && binding.type !== 'error') continue;
      const node = source.slice(binding.value.expr.start, binding.value.expr.end).trim();
      (binding.type === 'control' ? bound : marked).push({ el, attr, node, block, inLoop });
    }
  });

  const markers = new Map<ElementNode, Marker>();
  const describedBy = new Map<ElementNode, ElementNode>();
  const problems: MarkerProblem[] = [];
  const named = new Set<string>();

  for (const m of marked) {
    if (m.inLoop) {
      problems.push({
        code: 'FUD0598',
        message: `an \`error\` marker cannot sit inside a loop: every row would carry the same id for \`${m.node}\``,
        span: m.attr.span,
      });
      continue;
    }
    if (named.has(m.node)) {
      problems.push({
        code: 'FUD0598',
        message: `\`${m.node}\` already has an \`error\` marker in this component: a node speaks through one element`,
        span: m.attr.span,
      });
      continue;
    }
    named.add(m.node);

    const id = staticId(m.el);
    if (id === undefined || hasContent(m.el)) {
      problems.push({
        code: 'FUD0599',
        message:
          'an `error` marker must be empty and, if it has an `id`, a static one: the runtime writes its text, and `aria-describedby` has to name it',
        span: m.attr.span,
      });
      continue;
    }

    const targets = bound.flatMap((b) => {
      if (b.node !== m.node || b.block !== m.block) return [];
      const target = controlTarget(b.el, isComponent(b.el.name));
      return target.kind === 'value' || target.kind === 'form' || target.kind === 'group'
        ? [{ el: b.el, kind: target.kind }]
        : [];
    });
    const first = targets[0];
    if (first === undefined) {
      problems.push({
        code: 'FUD0597',
        message: `no element of this block binds \`${m.node}\` with \`control\`: a marker describes an element beside it, and \`aria-describedby\` does not cross a shadow root — inside a control-component, mark its own \`<input>\``,
        span: m.attr.span,
      });
      continue;
    }
    markers.set(m.el, { node: m.node, kind: first.kind, id });
    for (const t of targets) describedBy.set(t.el, m.el);
  }

  return { markers, describedBy, problems };
}

/**
 * The marker's own `id`: its text when static, `null` when it wrote none, `undefined` when it
 * wrote one the compiler cannot read — an `@` in it.
 */
function staticId(el: ElementNode): string | null | undefined {
  const attr = el.attributes.find((a) => typeof a.name === 'string' && a.name.toLowerCase() === 'id');
  if (attr === undefined) return null;
  let text = '';
  for (const part of attr.value) {
    if (part.type !== 'attribute-text') return undefined;
    text += part.value;
  }
  return text;
}

/** Whether the author wrote anything inside the marker that the runtime would overwrite. */
function hasContent(el: ElementNode): boolean {
  return el.children.some((c) => c.type !== 'text' || c.value.trim() !== '');
}

/**
 * Depth-first over the elements, telling each one which block it is in and whether a loop
 * encloses it. A block is identified by its content list, which is unique per branch.
 */
function walkBlocks(
  nodes: readonly HtmlContent[],
  block: object,
  inLoop: boolean,
  visit: (el: ElementNode, block: object, inLoop: boolean) => void,
): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'element': {
        const el = node as ElementNode;
        visit(el, block, inLoop);
        walkBlocks(el.children, block, inLoop, visit);
        break;
      }
      case 'if': {
        const ifNode = node as unknown as IfNode;
        for (const branch of ifNode.branches) walkBlocks(branch.body, branch.body, inLoop, visit);
        if (ifNode.elseBody) walkBlocks(ifNode.elseBody, ifNode.elseBody, inLoop, visit);
        break;
      }
      case 'switch':
        for (const branch of (node as unknown as SwitchNode).cases) {
          walkBlocks(branch.body, branch.body, inLoop, visit);
        }
        break;
      case 'foreach':
      case 'for':
      case 'while': {
        const body = (node as unknown as ForeachNode | ForNode | WhileNode).body;
        walkBlocks(body, body, true, visit);
        break;
      }
      case 'section':
      case 'snippet': {
        const children = (node as unknown as SectionNode | SnippetDeclNode).children;
        walkBlocks(children, children, inLoop, visit);
        break;
      }
      default:
        break;
    }
  }
}
