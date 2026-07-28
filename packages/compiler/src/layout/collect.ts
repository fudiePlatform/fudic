/**
 * Directive collection (SDD-21 §4.2). A layout's `@RenderBody()` sits wherever the author
 * put it — inside `<main>`, inside an `@if` — so finding the directives means walking the
 * tree, not the top level.
 *
 * It lives here, next to the nodes it collects, rather than in SDD-12's shared walk: the
 * structuring pass (SDD-10) is what needs it, and SDD-10 cannot depend on the semantic
 * pass (which already depends on SDD-10's types). The two walks stay independent on
 * purpose — this one is about markers, that one about analyzers.
 */

import type { HtmlContent, ElementNode } from '../html/index.js';
import type {
  IfNode,
  ConditionalBranch,
  ForeachNode,
  ForNode,
  WhileNode,
  SwitchNode,
  SwitchCase,
} from '../control/index.js';
import type { RenderDirectiveNode, RenderSectionNode, SectionNode } from './nodes.js';

/** Every directive found in a tree, in source order. */
export interface DirectiveSet {
  readonly renderBody: readonly RenderDirectiveNode[];
  readonly renderHead: readonly RenderDirectiveNode[];
  readonly renderSections: readonly RenderSectionNode[];
  /** `@section` blocks that are direct children of the walked roots (decision 83). */
  readonly sections: readonly SectionNode[];
  /** `@section` blocks found deeper: misplaced, since a section is a top-level node. */
  readonly nestedSections: readonly SectionNode[];
}

interface Sink {
  renderBody: RenderDirectiveNode[];
  renderHead: RenderDirectiveNode[];
  renderSections: RenderSectionNode[];
  sections: SectionNode[];
  nestedSections: SectionNode[];
}

// A layout node is stored in the SDD-05 tree as the base RazorConstruct (only `type`
// survives the union); SDD-21 produced the concrete node. This is the single place the
// cast happens, mirroring `markup.ts`'s asIf/asForeach.
const asRender = (n: HtmlContent): RenderDirectiveNode => n as unknown as RenderDirectiveNode;
const asRenderSection = (n: HtmlContent): RenderSectionNode => n as unknown as RenderSectionNode;
const asSection = (n: HtmlContent): SectionNode => n as unknown as SectionNode;

/**
 * Collect every directive reachable from `roots`, descending into elements, control bodies
 * and section bodies. `topLevel` distinguishes a `@section` written as a root node of the
 * document (valid) from one buried inside markup (FUD0421).
 */
export function collectDirectives(roots: readonly HtmlContent[]): DirectiveSet {
  const sink: Sink = {
    renderBody: [],
    renderHead: [],
    renderSections: [],
    sections: [],
    nestedSections: [],
  };
  walk(roots, sink, true);
  return sink;
}

/** True when `subtree` contains `node` — how §4.2 decides if a `@RenderHead()` is in `<head>`. */
export function containsNode(subtree: ElementNode, node: HtmlContent): boolean {
  let found = false;
  const scan = (nodes: readonly HtmlContent[]): void => {
    for (const n of nodes) {
      if (found) return;
      if (n === node) {
        found = true;
        return;
      }
      scan(childrenOf(n));
    }
  };
  scan(subtree.children);
  return found;
}

/**
 * A construct's body list, or empty. Defensive on purpose: `parseControl` is INJECTED
 * (SDD-05's seam), so a host may supply a stand-in that produces `{ type, span }` with no
 * body at all. A cast that trusted the concrete SDD-06 shape would crash on it.
 */
function listOf<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? (value as readonly T[]) : [];
}

/** The content children of any node that has some: elements, control bodies, sections. */
function childrenOf(node: HtmlContent): readonly HtmlContent[] {
  switch (node.type) {
    case 'element':
      return node.children;
    case 'section':
      return listOf<HtmlContent>(asSection(node).children);
    case 'if': {
      const ifNode = node as unknown as Partial<IfNode>;
      const out: HtmlContent[] = [];
      for (const branch of listOf<ConditionalBranch>(ifNode.branches)) {
        out.push(...listOf<HtmlContent>(branch.body));
      }
      out.push(...listOf<HtmlContent>(ifNode.elseBody));
      return out;
    }
    case 'foreach':
    case 'for':
    case 'while':
      return listOf<HtmlContent>((node as unknown as Partial<ForeachNode | ForNode | WhileNode>).body);
    case 'switch': {
      const out: HtmlContent[] = [];
      for (const c of listOf<SwitchCase>((node as unknown as Partial<SwitchNode>).cases)) {
        out.push(...listOf<HtmlContent>(c.body));
      }
      return out;
    }
    default:
      return [];
  }
}

function walk(nodes: readonly HtmlContent[], sink: Sink, topLevel: boolean): void {
  for (const node of nodes) {
    switch (node.type) {
      case 'render-body':
        sink.renderBody.push(asRender(node));
        break;
      case 'render-head':
        sink.renderHead.push(asRender(node));
        break;
      case 'render-section':
        sink.renderSections.push(asRenderSection(node));
        break;
      case 'section': {
        const section = asSection(node);
        (topLevel ? sink.sections : sink.nestedSections).push(section);
        break;
      }
      default:
        break;
    }
    walk(childrenOf(node), sink, false);
  }
}
