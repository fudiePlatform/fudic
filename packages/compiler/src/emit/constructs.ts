/**
 * The shape of a control construct, seen from the emit (SDD-30 §4.1).
 *
 * The five constructs differ in two things only — how many instances can be alive, and what
 * decides which one — and both are read off the same two facts: the branches a construct
 * offers, and whether it iterates. Everything else about `@if`, `@switch`, `@for`,
 * `@foreach` and `@while` is the same block.
 *
 * A branch is a block of its own: its own function, its own nodes, its own dependency list.
 * Two arms of an `@if` share neither, which is why they are listed rather than merged.
 */

import type { ElementNode, HtmlContent, RawExpressionNode } from '../html/index.js';
import type {
  ControlNode,
  ForNode,
  ForeachNode,
  IfNode,
  SwitchNode,
  WhileNode,
} from '../control/index.js';
import type { SectionNode } from '../layout/index.js';
import type { RazorExpression } from '../at/index.js';
import type { JsFragmentKind } from '../oxc/index.js';
import type { Span } from '../types/index.js';

/** The three constructs that iterate, and therefore carry a key (decision 91). */
export type LoopNode = ForeachNode | ForNode | WhileNode;

const LOOP_TYPES: ReadonlySet<string> = new Set(['foreach', 'for', 'while']);

export function isLoop(node: ControlNode): node is LoopNode {
  return LOOP_TYPES.has(node.type);
}

/** One block of a construct: what it renders, and what the parent evaluates to reach it. */
export interface Branch {
  readonly body: readonly HtmlContent[];
  /**
   * The JS the PARENT runs to decide this branch: the condition of an arm, the test of a
   * `case`. Absent for `else`, for `default`, and for the single branch of a loop — nothing
   * is chosen there.
   */
  readonly test?: Span;
  /** How the branch is reached, for the shape the emit writes around it. */
  readonly kind: 'if' | 'else-if' | 'else' | 'case' | 'default' | 'loop';
}

/**
 * The branches of a construct, in source order.
 *
 * A loop has exactly one: it renders the same block N times, and the N is the data's, not
 * the template's.
 */
export function branchesOf(node: ControlNode): readonly Branch[] {
  if (isLoop(node)) return [{ body: node.body, kind: 'loop' }];
  if (node.type === 'switch') return switchBranches(node);
  return ifBranches(node);
}

function ifBranches(node: IfNode): readonly Branch[] {
  const out: Branch[] = node.branches.map((branch, i) => ({
    body: branch.body,
    test: branch.header.inner,
    kind: i === 0 ? 'if' : 'else-if',
  }));
  if (node.elseBody !== undefined) out.push({ body: node.elseBody, kind: 'else' });
  return out;
}

function switchBranches(node: SwitchNode): readonly Branch[] {
  return node.cases.map((branch) =>
    branch.test === undefined
      ? { body: branch.body, kind: 'default' as const }
      : { body: branch.body, test: branch.test, kind: 'case' as const },
  );
}

/**
 * Every JS span the HEADER of a branching construct holds — what the parent evaluates to
 * choose, not what the chosen block renders. A loop is not here: its header is a
 * `for`/`for-of` fragment, wrapped differently, and it carries exactly one.
 */
export function headerSpans(node: IfNode | SwitchNode): readonly Span[] {
  if (node.type === 'switch') return [node.header.inner];
  return node.branches.map((branch) => branch.header.inner);
}

/** The wrapper each loop's header needs so a synthetic buffer of them stays valid JS. */
const LOOP_KIND: Readonly<Record<'foreach' | 'for' | 'while', JsFragmentKind>> = {
  foreach: 'for-of-header',
  for: 'for-header',
  while: 'expression',
};

/** What a walk over the template's JS is told: the fragment, and how it has to be wrapped. */
export type JsFragmentVisitor = (kind: JsFragmentKind, span: Span) => void;

/**
 * Every JS fragment a markup tree evaluates, in SOURCE ORDER.
 *
 * One walk with two readers, and they must not drift: the batch registers what this yields
 * so Oxc parses it, and the dependency list of a block asks for the AST of exactly the same
 * spans. A fragment one of them saw and the other did not is a dependency with no AST — or
 * an AST nobody claims.
 */
export function collectTemplateJs(nodes: readonly HtmlContent[], visit: JsFragmentVisitor): void {
  for (const node of nodes) collectNode(node, visit);
}

function collectNode(node: HtmlContent, visit: JsFragmentVisitor): void {
  switch (node.type) {
    case 'element': {
      const el = node as ElementNode;
      for (const attribute of el.attributes) {
        // `bus:(expr)="…"` (decision 28.b) is the only attribute whose NAME is an expression.
        if (typeof attribute.name !== 'string') visit('expression', attribute.name.expr);
        for (const part of attribute.value) {
          if (part.type === 'razor-expression') visit('expression', part.expr);
        }
      }
      collectTemplateJs(el.children, visit);
      return;
    }
    case 'razor-expression':
      visit('expression', (node as RazorExpression).expr);
      return;
    case 'raw-expression':
      visit('expression', (node as RawExpressionNode).expr.expr);
      return;
    case 'inline-code':
      visit('block-statements', node.group.inner);
      return;
    case 'if':
    case 'switch':
    case 'foreach':
    case 'for':
    case 'while': {
      const control = node as unknown as ControlNode;
      // The key is read in the scope of the BODY (decision 91), so it travels with it.
      if (isLoop(control) && control.key !== undefined) visit('expression', control.key.expr);
      if (isLoop(control)) visit(LOOP_KIND[control.type], control.header.inner);
      else for (const span of headerSpans(control)) visit('expression', span);
      for (const branch of branchesOf(control)) {
        if (branch.test !== undefined && branch.kind === 'case') visit('expression', branch.test);
        collectTemplateJs(branch.body, visit);
      }
      return;
    }
    case 'section':
      collectTemplateJs((node as unknown as SectionNode).children, visit);
      return;
    default:
      // Text, comments, doctype, cdata, raw text, `@@`, `@code`, the `Render*` markers and
      // the degraded node: none of them holds JS the template evaluates.
      return;
  }
}
