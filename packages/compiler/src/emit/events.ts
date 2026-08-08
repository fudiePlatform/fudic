/**
 * Event and bus bindings: from the value the author wrote to the expression that gets
 * subscribed (SDD-15 §4.5, rewritten by grammar decisions 96–98).
 *
 * **The rule is one.** What sits to the right of the `=` is an INVOCATION, evaluated at
 * DISPATCH, with `$event` as the native event and whatever data the author writes beside
 * it. The handler is declared FLAT — `function del(ev, id) {…}` — exactly as in Angular and
 * Vue. The *factory* form the previous version of the spec derived from decision 26 — a
 * `CallExpression` invoked at SUBSCRIBE time, whose return was the listener, and which made
 * the author write `const del = (id) => (e) => {…}` — is retired: it saved one frame per
 * dispatch and charged for it in every line the developer writes.
 *
 * The distinction is made on the ROOT node Oxc returns for the value, never on its text:
 *
 * | Root node                     | Emitted                                   | Frames |
 * |-------------------------------|-------------------------------------------|--------|
 * | `Identifier`                  | `$dom.event(n,'click',toggle)`            | 1      |
 * | `CallExpression`              | `$dom.event(n,'click',($event) => del(…))`| 2      |
 * | `Arrow` / `Function`          | `$dom.event(n,'click', e => …)`           | 2      |
 * | anything else                 | **`FUD0291`**                             | —      |
 *
 * The arrow's parameter is literally called `$event`, so substituting it is copying the
 * argument list VERBATIM: the emit never reorders it, and `@del(item.id, $event)` arrives
 * as `(id, ev)`. `$event` falls inside the `$` reserve (§4.7), so no user identifier can
 * collide with it.
 *
 * A `bus:` handler is the same shapes with one difference: it is called with the HOST as
 * its context (§4.4), so the handler reaches the signals of ITS instance. That is why a
 * call is not copied whole there but reassembled as `f.call($host, …)` — wrapping it in an
 * arrow instead would bind nothing, since an arrow ignores the `this` of `.call`.
 */

import type { OxcNode } from '../oxc/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import type { FragmentAst } from './scope.js';
import type { TemplateJs } from './oxc-code.js';

/** The value of an event binding whose root node is none of the four shapes (§4.5). */
export const FUD_UNSUITABLE_HANDLER = 'FUD0291';

/**
 * What the hookup needs beyond the markup, shared by every walk of ONE file.
 *
 * It travels as a single object because the three facts belong together: the AST of the
 * template is what the shapes are read off, the diagnostics are where a value that is none
 * of them lands, and `$host` is what a `bus:` makes the factory materialize. A block's walk
 * gets the very same object, so a subscription three levels inside a `@foreach` marks the
 * component's header just as one at the root does.
 */
export interface HookupContext {
  readonly template: TemplateJs;
  /** The emit never throws (§5): an unsuitable handler is reported and its binding skipped. */
  readonly diagnostics: Diagnostic[];
  /** Marked when a binding reads `$host`, so the factory declares it (§4.4). */
  hostUsed: boolean;
}

export function hookupContext(template: TemplateJs, diagnostics: Diagnostic[]): HookupContext {
  return { template, diagnostics, hostUsed: false };
}

/** The three roots that ARE the listener: what they evaluate to is subscribed as it is. */
const DIRECT: ReadonlySet<string> = new Set([
  'Identifier',
  'ArrowFunctionExpression',
  'FunctionExpression',
]);

/**
 * The root node of a value, past any parentheses the author wrote.
 *
 * The batch parses with `preserveParens`, so `@((e) => f(e))` arrives as a
 * `ParenthesizedExpression` around the arrow. Those parens are the author's own — the ones
 * of the `@( … )` atom are not in the span — and refusing a handler over them would be
 * `FUD0291` on perfectly good JS.
 */
function rootOf(ast: FragmentAst): OxcNode | undefined {
  let node = Array.isArray(ast) ? undefined : (ast as OxcNode);
  while (node !== undefined && node.type === 'ParenthesizedExpression') {
    node = node['expression'] as OxcNode | undefined;
  }
  return node;
}

/** The listener a plain `@event` binding subscribes, or `undefined` for `FUD0291`. */
export function eventHandler(source: string, at: Span, ctx: HookupContext): string | undefined {
  const root = rootOf(ctx.template.ast(at));
  const text = source.slice(at.start, at.end);
  if (root === undefined) return undefined;
  // Invoked at DISPATCH, inside an arrow whose parameter is spelled `$event`: the argument
  // list is copied character for character, so what the author wrote is what runs.
  if (root.type === 'CallExpression') return `($event) => ${text}`;
  return DIRECT.has(root.type) ? text : undefined;
}

/**
 * The listener a `bus:` binding subscribes: the same handler, called with the host as its
 * context. `undefined` for `FUD0291`.
 *
 * A call is taken apart rather than copied because the context has to reach the AUTHOR's
 * function: `f($event, x)` becomes `f.call($host, $event, x)`, with the argument list
 * sliced out of the source verbatim so its order and its `$event` survive untouched.
 */
export function busHandler(source: string, at: Span, ctx: HookupContext): string | undefined {
  const root = rootOf(ctx.template.ast(at));
  const text = source.slice(at.start, at.end);
  if (root === undefined) return undefined;
  if (root.type === 'CallExpression') {
    const callee = root['callee'] as OxcNode;
    const args = root['arguments'] as readonly OxcNode[];
    const last = args[args.length - 1];
    const written =
      last === undefined
        ? ''
        : `, ${source.slice(ctx.template.offset(args[0]!.start), ctx.template.offset(last.end))}`;
    return `($event) => ${source.slice(at.start, ctx.template.offset(callee.end))}.call($host${written})`;
  }
  if (!DIRECT.has(root.type)) return undefined;
  // A bare reference takes no parens; a lambda does, or `.call` would parse as part of it.
  return `($event) => ${root.type === 'Identifier' ? text : `(${text})`}.call($host, $event)`;
}
