/**
 * The dispatch: one node in, one document out.
 *
 * The default branch is the design, not a gap. Text, comments, the doctype, CDATA, `@@`,
 * a Razor comment, the `Render*` markers and the degraded node all have exactly one correct
 * printing — the source, verbatim — and writing that once is both shorter and safer than
 * nine cases that each rebuild what they were given.
 */

import type {
  ForeachNode,
  HtmlContent,
  IfNode,
  InlineCodeNode,
  RawExpressionNode,
  RazorExpression,
  SectionNode,
  SwitchNode,
  WhileNode,
  CodeBlockNode,
} from '@fudic/compiler';
import type { Doc } from '../doc/index.js';
import { leafOf, sliceOf, type PrintContext } from './context.js';
import { printElement } from './element.js';
import { printCode, printInlineCode, printSection } from './code.js';
import { printIf, printLoop, printSwitch, printWhile } from './control.js';

// A construct is stored as the base `RazorConstruct`; recover the concrete node.
const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asLoop = (node: HtmlContent): ForeachNode => node as unknown as ForeachNode;
const asWhile = (node: HtmlContent): WhileNode => node as unknown as WhileNode;
const asSwitch = (node: HtmlContent): SwitchNode => node as unknown as SwitchNode;
const asCode = (node: HtmlContent): CodeBlockNode => node as unknown as CodeBlockNode;
const asSection = (node: HtmlContent): SectionNode => node as unknown as SectionNode;

/** `@expr` or `@(expr)`, with the expression already formatted. */
function printExpression(ctx: PrintContext, node: RazorExpression): Doc {
  const inner = leafOf(ctx, node.expr);
  return node.kind === 'explicit' ? `@(${inner})` : `@${inner}`;
}

/** `@raw( … )` — unescaped interpolation (decision 18). */
function printRaw(ctx: PrintContext, node: RawExpressionNode): Doc {
  return `@raw(${leafOf(ctx, node.expr.expr)})`;
}

/**
 * Print any child of an element or of the document.
 *
 * There is no `breakable` argument here on purpose: whether a break may be introduced is a
 * property of the CONTAINER, and it reaches the output through the gaps between children,
 * never through the children themselves.
 */
export function printNode(ctx: PrintContext, node: HtmlContent): Doc {
  switch (node.type) {
    case 'element':
      return printElement(ctx, node);
    case 'razor-expression':
      return printExpression(ctx, node);
    case 'raw-expression':
      return printRaw(ctx, node);
    case 'inline-code':
      return printInlineCode(ctx, node as InlineCodeNode);
    case 'if':
      return printIf(ctx, asIf(node));
    case 'foreach':
      return printLoop(ctx, 'foreach', asLoop(node));
    case 'for':
      return printLoop(ctx, 'for', asLoop(node));
    case 'while':
      return printWhile(ctx, asWhile(node));
    case 'switch':
      return printSwitch(ctx, asSwitch(node));
    case 'code':
      return printCode(ctx, asCode(node));
    case 'section':
      return printSection(ctx, asSection(node));
    default:
      return sliceOf(ctx, node.span);
  }
}
