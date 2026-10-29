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
  AwaitNode,
  ControlNode,
  ForNode,
  ForeachNode,
  IfNode,
  SwitchNode,
  WhileNode,
} from '../control/index.js';
import { keyExpression } from '../control/index.js';
import { classifyAttribute, spreadExpr } from '../binding/index.js';
import type { SectionNode } from '../layout/index.js';
import type { RenderCallNode, SnippetDeclNode } from '../snippet/index.js';
import type { RazorExpression } from '../at/index.js';
import type { JsFragmentKind } from '../oxc/index.js';
import type { Span } from '../types/index.js';

/** The three constructs that iterate, and therefore carry a key (decision 91). */
export type LoopNode = ForeachNode | ForNode | WhileNode;

const LOOP_TYPES: ReadonlySet<string> = new Set(['foreach', 'for', 'while']);

export function isLoop(node: ControlNode): node is LoopNode {
  return LOOP_TYPES.has(node.type);
}

/**
 * `for (…)` / `while (…)` — the author's header, spliced whole (decision 93).
 *
 * Both emit branches split it with THIS function, and that is the point: a `@for` whose
 * header holds an unusual `;`, or a `@while` written with a comma operator, cannot compile
 * to one shape on the server and another on the client. Same argument that makes `marker.ts`
 * a module instead of a method (SDD-30 §3.4).
 */
export function loopHead(node: LoopNode, source: string): string {
  const inner = source.slice(node.header.inner.start, node.header.inner.end);
  return node.type === 'while' ? `while (${inner})` : `for (${inner})`;
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
  readonly kind: 'if' | 'else-if' | 'else' | 'case' | 'default' | 'loop' | 'empty' | 'await' | 'catch';
}

/**
 * The two blocks of an `@await` (SDD-70): its body, and its `@catch` when written. Only one of
 * them ever paints, like two arms of an `@if`, and the field decides which.
 */
export function awaitBranches(node: AwaitNode): readonly Branch[] {
  const body: Branch = { body: node.body, kind: 'await' };
  return node.catch === undefined ? [body] : [body, { body: node.catch.body, kind: 'catch' }];
}

/**
 * The branches of any construct that holds markup, `@await` included: for a walk that only
 * descends and asks nothing of the header.
 */
export function blocksOf(node: HtmlContent): readonly Branch[] {
  if (node.type === 'await') return awaitBranches(node as unknown as AwaitNode);
  return CONTROL_TYPES.has(node.type) ? branchesOf(node as unknown as ControlNode) : [];
}

/**
 * The branches of a construct, in source order.
 *
 * A loop has one: it renders the same block N times, and the N is the data's, not the
 * template's. And a second when it has an `@empty` (SDD-61 §3.7): the block that renders
 * instead when N is zero, outside the loop's scope.
 */
export function branchesOf(node: ControlNode): readonly Branch[] {
  if (isLoop(node)) {
    const loop: Branch = { body: node.body, kind: 'loop' };
    return node.empty === undefined ? [loop] : [loop, { body: node.empty.body, kind: 'empty' }];
  }
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

/**
 * The JS of ONE element's attributes, without descending into it.
 *
 * For the component's own host wrapper (BUG-32 T2): its children are the `<template>`, which
 * the template walk already covers, so a full `collectNode` over it would register every
 * fragment of the file twice. What it owns is its attributes, and those had no AST at all —
 * which is why an `@click` there emitted no listener while its plain attributes emitted fine:
 * `eventHandler` asks the batch for the handler's AST and got nothing back.
 */
export function collectAttributeJs(el: ElementNode, visit: JsFragmentVisitor): void {
  for (const attribute of el.attributes) {
    // `bus:(expr)="…"` (decision 28.b) is the only attribute whose NAME is an expression.
    if (typeof attribute.name !== 'string') visit('expression', attribute.name.expr);
    // `...item` (props-spec §5): the object is in the NAME, and the view reads it like a value.
    const spread = spreadExpr(attribute);
    if (spread !== null) visit('expression', spread);
    for (const part of attribute.value) {
      if (part.type === 'razor-expression') visit('expression', part.expr);
    }
  }
}

function collectNode(node: HtmlContent, visit: JsFragmentVisitor): void {
  switch (node.type) {
    case 'element': {
      const el = node as ElementNode;
      collectAttributeJs(el, visit);
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
      // The key is read in the scope of the BODY (decision 91), so it travels with it. An
      // unfinished one carries no JS to hand to Oxc, which is what `keyExpression` filters.
      const key = isLoop(control) ? keyExpression(control) : undefined;
      if (key !== undefined) visit('expression', key);
      if (isLoop(control)) visit(LOOP_KIND[control.type], control.header.inner);
      else for (const span of headerSpans(control)) visit('expression', span);
      for (const branch of branchesOf(control)) {
        if (branch.test !== undefined && branch.kind === 'case') visit('expression', branch.test);
        collectTemplateJs(branch.body, visit);
      }
      return;
    }
    case 'await':
      // What follows `@await` is no JS the template evaluates: it names a `later` field, and
      // the emit reads that field by name (SDD-70). Its two blocks are markup like any other.
      for (const branch of awaitBranches(node as unknown as AwaitNode)) collectTemplateJs(branch.body, visit);
      return;
    case 'section':
      collectTemplateJs((node as unknown as SectionNode).children, visit);
      return;
    case 'render':
      // The arguments of a `@render` (SDD-29 §4.7). The expansion needs them parsed to know
      // which of them mention a parameter of the body they are written in; the emit never
      // sees one, because the expansion replaced it long before.
      for (const arg of (node as unknown as RenderCallNode).args) visit('expression', arg.value);
      return;
    case 'snippet':
      // A declaration's body is markup of this file until somebody expands it, and in the
      // editor nobody ever does (SDD-29 §4.11): its expressions are projected and checked
      // here, so they need an AST here. The build never reaches this case at all — the
      // expansion removed every declaration before the emit read a line.
      collectTemplateJs((node as unknown as SnippetDeclNode).children, visit);
      return;
    default:
      // Text, comments, doctype, cdata, raw text, `@@`, `@code`, the `Render*` markers and
      // the degraded node: none of them holds JS the template evaluates.
      return;
  }
}

/**
 * The `@raw(…)` that owns the whole content of `el`, or `null` (decision 18).
 *
 * Blank text and Razor comments around it are formatting and are dropped. The server and the
 * client branch both ask THIS function, so they cannot disagree about which elements write
 * their content as HTML. Any other shape is `FUD0990` and paints nothing for the `@raw`.
 */
export function rawChild(el: ElementNode): RawExpressionNode | null {
  const content = el.children.filter(
    (n) => !((n.type === 'text' && n.value.trim() === '') || n.type === 'razor-comment'),
  );
  const only = content[0];
  return content.length === 1 && only!.type === 'raw-expression' && el.name !== 'template'
    ? (only as RawExpressionNode)
    : null;
}

/**
 * The variable a well-formed `ref="@name"` writes on one element, or `null` (decision 30).
 *
 * A malformed ref (`@a.b`, `@(x)`) already carries its diagnostic and writes nothing: the
 * emit does not guess which variable the author meant.
 */
export function refTarget(el: ElementNode, source: string): string | null {
  for (const attr of el.attributes) {
    const { value: b, diagnostics } = classifyAttribute(attr, source);
    if (b.type === 'ref' && diagnostics.length === 0) return source.slice(b.value.expr.start, b.value.expr.end);
  }
  return null;
}

/**
 * Every variable a `ref` WRITES inside a markup tree, nested constructs included.
 *
 * A block takes the names its body reads as parameters, by value — and a ref is a write to
 * the author's own `let`, which a parameter would swallow. So these are not dependencies.
 */
export function refTargets(nodes: readonly HtmlContent[], source: string): ReadonlySet<string> {
  const out = new Set<string>();
  const walk = (list: readonly HtmlContent[]): void => {
    for (const node of list) {
      if (node.type === 'element') {
        const name = refTarget(node as ElementNode, source);
        if (name !== null) out.add(name);
        walk((node as ElementNode).children);
      } else {
        for (const branch of blocksOf(node)) walk(branch.body);
      }
    }
  };
  walk(nodes);
  return out;
}

const CONTROL_TYPES: ReadonlySet<string> = new Set(['if', 'switch', 'foreach', 'for', 'while']);
