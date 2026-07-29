/**
 * Control flow (SDD-23 §4.4).
 *
 *     @if (c) { A } else { B }        →  if (c) { …A… } else { …B… }
 *     @foreach (const x of xs) { … }  →  for (const x of xs) { … }
 *     @switch (e) { case k: … }       →  switch (e) { case k: { … } break; }
 *
 * Emitted as real control flow, and that is non-negotiable: it is what gives narrowing
 * inside an `@if` and the item type inside a `@foreach`, plus lexical scoping of anything
 * the header declares. A flat list of expressions loses all three, and no amount of
 * cleverness downstream gets them back.
 */

import type {
  ForNode,
  ForeachNode,
  IfNode,
  InlineCodeNode,
  Span,
  SwitchNode,
  WhileNode,
} from '@fudic/compiler';
import { isEmptySpan } from '@fudic/compiler';
import type { TemplateContext } from './context.js';

/** Every control construct this module projects. */
export type ControlLike = IfNode | ForeachNode | ForNode | WhileNode | SwitchNode;

/** What replaces a header the parser could not read, per construct. */
const LOOP_FALLBACK: Readonly<Record<'foreach' | 'for' | 'while', string>> = {
  foreach: 'const $item of []',
  for: ';;',
  while: 'undefined',
};

export function emitControl(ctx: TemplateContext, node: ControlLike): void {
  switch (node.type) {
    case 'if':
      return emitIf(ctx, node);
    case 'foreach':
    case 'for':
      return emitLoop(ctx, 'for', node);
    case 'while':
      return emitLoop(ctx, 'while', node);
    default:
      return emitSwitch(ctx, node);
  }
}

function emitIf(ctx: TemplateContext, node: IfNode): void {
  // A degraded `@if` with no arm (FUD0070, or an orphan `@else`) projects to nothing: there
  // is no condition to check and no body the user meant to guard.
  if (node.branches.length === 0) return;

  node.branches.forEach((branch, i) => {
    ctx.w.scaffold(i === 0 ? 'if (' : '} else if (', branch.span);
    emitHeader(ctx, branch.header.inner, 'undefined');
    ctx.w.scaffold(') {\n');
    ctx.emit(branch.body);
  });

  if (node.elseBody !== undefined) {
    ctx.w.scaffold('} else {\n');
    ctx.emit(node.elseBody);
  }
  ctx.w.scaffold('}\n');
}

function emitLoop(
  ctx: TemplateContext,
  keyword: 'for' | 'while',
  node: ForeachNode | ForNode | WhileNode,
): void {
  ctx.w.scaffold(`${keyword} (`, node.span);
  // Each loop needs its own placeholder, because each has its own header grammar: an empty
  // `for ()` is a syntax error where an empty `if ()` merely needs a value.
  emitHeader(ctx, node.header.inner, LOOP_FALLBACK[node.type]);
  ctx.w.scaffold(') {\n');
  ctx.emit(node.body);
  ctx.w.scaffold('}\n');
}

function emitSwitch(ctx: TemplateContext, node: SwitchNode): void {
  ctx.w.scaffold('switch (', node.span);
  emitHeader(ctx, node.header.inner, 'undefined');
  ctx.w.scaffold(') {\n');

  for (const branch of node.cases) {
    if (branch.test === undefined || isEmptySpan(branch.test)) {
      ctx.w.scaffold('default: {\n', branch.span);
    } else {
      ctx.w.scaffold('case ', branch.span);
      ctx.w.copy(branch.test);
      ctx.w.scaffold(': {\n');
    }
    ctx.emit(branch.body);
    // Synthetic `break`: there is no fall-through in the grammar (decision 14), so the
    // projection must not let the checker believe a case runs into the next.
    ctx.w.scaffold('break;\n}\n');
  }

  ctx.w.scaffold('}\n');
}

/** `@{ … }` — a lexically scoped block of statements, copied verbatim. */
export function emitInlineCode(ctx: TemplateContext, node: InlineCodeNode): void {
  ctx.w.scaffold('{\n', node.span);
  ctx.w.copy(node.group.inner);
  ctx.w.scaffold('\n}\n');
}

/**
 * Copy a control header, substituting a placeholder when it is empty.
 *
 * An unclosed or missing `( … )` already carries its own diagnostic (FUD0070). Emitting
 * `if () {` on top of that would make the whole virtual file unparseable, and the file
 * being edited is exactly the one that must keep answering completions (§4.6). The
 * placeholder is scaffolding, so it reports nothing of its own.
 */
function emitHeader(ctx: TemplateContext, inner: Span, fallback: string): void {
  if (isEmptySpan(inner)) ctx.w.scaffold(fallback);
  else ctx.w.copy(inner);
}
