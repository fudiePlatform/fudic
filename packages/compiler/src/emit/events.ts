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
import { handlerShape, unwrapParens } from '../binding/index.js';
import type { Diagnostic, Span } from '../types/index.js';
import type { FragmentAst } from './scope.js';
import type { TemplateJs } from './oxc-code.js';
import type { ControlPlan } from './controls.js';
import { CodeWriter } from './writer.js';

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
  /**
   * The props this component received as CELLS of a function (BUG-24 §4.6).
   *
   * A handler named by one of them is the cell, not the function: what has to be subscribed
   * is what the cell holds, so `@click=@onSave` becomes `onSave()` and `@click=@onSave(x)`
   * becomes `onSave()(x)`. Reading it at DISPATCH and not here is the point — the owner may
   * still have been cold when this listener was registered.
   */
  readonly callbacks: ReadonlySet<string>;
  /**
   * The `control` bindings of this file (SDD-34), resolved once for both branches.
   *
   * It rides here for the reason this object exists at all: it is a fact about the whole file
   * that every walk of it needs, and a block is a separate walk. A `control` inside an `@if`
   * has to emit its binding into that block's own `s()`, with that block's nodes, and this is
   * what carries the plan down to it without a rule of its own.
   */
  readonly controls: ControlPlan;
  /** The `@fudic/forms/dom` functions the walk actually called, for the import line. */
  readonly binds: Set<string>;
  /**
   * The names of this component's own props — what tells a `control` whose node ARRIVES from
   * the parent (decision 112) from one the component already holds.
   *
   * The two cannot be bound the same way. A node named by a neutral import is there when the
   * factory hooks up; a node that crossed as a prop is not, and never is: the payload the
   * parent composes reaches the child through `u`, and `u` is of value — it reassigns and
   * re-applies, it does not hook up again (BUG-12 §4.2).
   */
  readonly props: ReadonlySet<string>;
  /**
   * The bind calls of the top-level walk whose node can still arrive, and the prop names they
   * depend on. `$cb` is written from the first and `u`'s guard from the second.
   *
   * They ride on the file's context and not on the walk's bodies because the FACTORY is what
   * has to hold them: `u` lives there, and so do the node variables of the top level. A
   * `control` inside an `@if` writes into its block's `s()` as before — that block is made
   * again when the condition turns, and with it its binding.
   */
  readonly rebind: CodeWriter;
  readonly rebound: Set<string>;
}

export function hookupContext(
  template: TemplateJs,
  diagnostics: Diagnostic[],
  callbacks: ReadonlySet<string> = new Set(),
  controls: ControlPlan = new Map(),
  props: ReadonlySet<string> = new Set(),
): HookupContext {
  return {
    template,
    diagnostics,
    hostUsed: false,
    callbacks,
    controls,
    binds: new Set(),
    props,
    rebind: new CodeWriter(),
    rebound: new Set(),
  };
}

/** A CALL whose callee arrived as a cell, with the read spliced in: `onSave(x)` → `onSave()(x)`. */
function withCellRead(text: string, at: Span, call: OxcNode, ctx: HookupContext): string {
  const callee = call['callee'] as OxcNode;
  if (callee.type !== 'Identifier' || !ctx.callbacks.has(String(callee['name']))) return text;
  const end = ctx.template.offset(callee.end) - at.start;
  return text.slice(0, end) + '()' + text.slice(end);
}

/**
 * The root node of a value, past any parentheses the author wrote. The classification
 * itself is `handlerShape`'s (`binding/handler.ts`), so the editor decides it with the
 * very same function — a rule only one of the two knows reopens BUG-23 §2.4.
 */
function rootOf(ast: FragmentAst): OxcNode | undefined {
  return unwrapParens(Array.isArray(ast) ? undefined : (ast as OxcNode));
}

/** The listener a plain `@event` binding subscribes, or `undefined` for `FUD0291`. */
export function eventHandler(source: string, at: Span, ctx: HookupContext): string | undefined {
  const root = rootOf(ctx.template.ast(at));
  const text = source.slice(at.start, at.end);
  switch (handlerShape(root)) {
    // Invoked at DISPATCH, inside an arrow whose parameter is spelled `$event`: the argument
    // list is copied character for character, so what the author wrote is what runs.
    case 'call':
      return `($event) => ${withCellRead(text, at, root!, ctx)}`;
    // A bare reference to a callback prop has to be read at dispatch too, and the arrow is
    // what defers it: the cell may still be empty when this listener is registered.
    case 'reference':
      return ctx.callbacks.has(text) ? `($event) => ${text}()($event)` : text;
    case 'lambda':
      return text;
    case 'unsuitable':
      return undefined;
  }
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
  switch (handlerShape(root)) {
    case 'call': {
      const call = root as OxcNode;
      const callee = call['callee'] as OxcNode;
      const args = call['arguments'] as readonly OxcNode[];
      const last = args[args.length - 1];
      const written =
        last === undefined
          ? ''
          : `, ${source.slice(ctx.template.offset(args[0]!.start), ctx.template.offset(last.end))}`;
      return `($event) => ${source.slice(at.start, ctx.template.offset(callee.end))}.call($host${written})`;
    }
    // A bare reference takes no parens; a lambda does, or `.call` would parse as part of it.
    case 'reference':
      return `($event) => ${text}.call($host, $event)`;
    case 'lambda':
      return `($event) => (${text}).call($host, $event)`;
    case 'unsuitable':
      return undefined;
  }
}
