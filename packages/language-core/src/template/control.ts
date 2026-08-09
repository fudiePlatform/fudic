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
import { copyExpression } from './expr.js';

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
  // `key (…)` is evaluated in the scope of the BODY (decision 91), so it is projected as the
  // first statement inside the loop: that is what makes the key see `x` in
  // `@foreach (const x of xs) key (x.id)`, and what gives it completions and a diagnostic
  // of its own when it names something that does not exist. The header is already projected
  // as a real `for`, so no header shape needs a branch here — destructuring, a C-style
  // `@for` and a `@while` that declares nothing all arrive with their scope already right.
  //
  // Wrapped in `$key(…)` rather than left as a bare expression statement: an argument
  // position is a place TypeScript has an expected type for, so the caret inside an empty
  // `key (|)` gets the same answer as any other argument. `$key` takes `unknown` and judges
  // nothing (BUG-17 §3.1) — the FUD codes about a key are the compiler's, not this file's.
  if (node.key !== undefined) {
    ctx.w.scaffold('$key(');
    copyExpression(ctx, node.key.expr);
    ctx.w.scaffold(');\n');
  }
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
      copyExpression(ctx, branch.test);
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
  copyExpression(ctx, node.group.inner);
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
  else copyExpression(ctx, inner);
}
