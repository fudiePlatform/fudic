/**
 * Attribute codegen, shared by the server branch (`markup.ts`) and the client branch
 * (`markup-client.ts`).
 *
 * It lives in its own module for one reason: the two branches MUST agree byte for byte on
 * what an attribute becomes. The `h` path adopts the markup the server painted, so a
 * `class` composed in a different order, or a boolean attribute omitted on one side and
 * written on the other, is not a cosmetic difference — it is a component that hydrates
 * against a tree it does not recognise. Two copies of this logic would drift; one cannot.
 */

import {
  decodeEntities,
  type ElementNode,
  type Attribute,
  type AttributeText,
  type AttributeValuePart,
} from '../html/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Span } from '../types/index.js';
import { classifyAttribute, type Binding } from '../binding/index.js';
import type { CodeWriter } from './writer.js';
import type { AssetLinker } from './assets.js';

/**
 * A single-URL asset attribute the linker rewrites: `src`/`poster` on any element, or
 * `href` on a `<link>` (stylesheet/icon) — never `<a href>`, which is navigation.
 */
export const isAssetAttr = (element: string, attribute: string): boolean =>
  attribute === 'src' || attribute === 'poster' || (attribute === 'href' && element === 'link');

/**
 * The characters a literal attribute run contributes. Same rule as a text run (BUG-14 §3.2):
 * what `setAttr` receives is the VALUE, not markup, so the entities of the source are decoded
 * here and re-encoded by whoever writes it out — `escapeAttr` on the server, nothing at all on
 * the client, where an attribute is set through the DOM and never through a parser. `@@` is
 * already a bare `@` by now: the parser resolves it in value position.
 */
const attrText = (part: AttributeText): string => decodeEntities(part.value);

/**
 * JS expression for an attribute's value. Three shapes, in order: all literal → a string;
 * one lone `@expr` → the expression itself, UNSTRINGIFIED, so a boolean or a number keeps
 * its type (that is what lets decision 21 omit a falsy boolean attribute); anything mixed →
 * a template literal.
 */
export function attrExpr(source: string, attr: Attribute): string {
  const slice = (sp: Span): string => source.slice(sp.start, sp.end);
  const parts = attr.value;
  const texts = parts.filter((p): p is AttributeText => p.type === 'attribute-text');
  if (texts.length === parts.length) return JSON.stringify(texts.map(attrText).join(''));
  // Not all literal, and a single part: that part is the expression.
  if (parts.length === 1) return `(${slice((parts[0] as RazorExpression).expr)})`;
  const template = parts
    .map((p) =>
      p.type === 'attribute-text'
        ? attrText(p).replace(/[`\\$]/gu, '\\$&')
        : '${' + slice(p.expr) + '}',
    )
    .join('');
  return '`' + template + '`';
}

/**
 * What the emitters need to know ABOUT the element they are writing attributes for, beyond
 * the node itself.
 *
 * Two facts, and both are about the host rather than the attribute, which is why they
 * travel together instead of as two more positional arguments.
 */
export interface HostContext {
  /** A component tag (decision 41): what decides whether a `.prop` is an attribute at all. */
  readonly isComponent: boolean;
  /** The names this component declares with `signal(...)`. See `crossingExpr`. */
  readonly signals: ReadonlySet<string>;
}

/** A host with nothing declared around it — a page body, a template with no `@client`. */
export const NO_SIGNALS: HostContext = { isComponent: false, signals: new Set() };

/**
 * The name of the REACTIVE a value crosses with, or `undefined` when it crosses none.
 *
 * The rule is deliberately narrow: the whole value must be one `@expr` whose text is the
 * bare name of something in `reactives` — a `signal(...)` or a `computed(...)` this scope
 * declares, or a prop it received as reactive itself. `@count` is reactive; `@(count() + 1)`
 * is a value that happens to read one, and the difference is what decides whether anything
 * downstream can ever move.
 *
 * ONE definition, three readers: the expression a value crosses with (`crossingExpr`), the
 * subscription the parent emits (`markup-client.ts#slots`) and the effective level of the
 * child (`level.ts`). Two copies of this would drift, and the drift is silent in the worst
 * direction — a parent that emits `$sub` for a child the page never marked hydratable, or a
 * child marked hydratable that nobody ever updates.
 */
export function reactiveName(
  source: string,
  value: readonly AttributeValuePart[],
  reactives: ReadonlySet<string>,
): string | undefined {
  const only = value.length === 1 ? value[0] : undefined;
  if (only?.type !== 'razor-expression') return undefined;
  const text = source.slice(only.expr.start, only.expr.end);
  return reactives.has(text) ? text : undefined;
}

/**
 * The expression a value crosses the shadow boundary with.
 *
 * Decision 84: a VALUE crosses, never the signal object. So a value whose text is exactly
 * the name of a `signal(...)` this component declares crosses as `name()` — otherwise
 * the server would paint `[object Object]` and the client would hand the child a live
 * object it cannot serialize (SDD-17). Anything else crosses as written.
 *
 * The call form is the only read since SDD-31 §4.0, and it costs nothing here: this
 * expression is evaluated by `$s`/`$a`, outside any effect, so it tracks nobody.
 *
 * The rule lives here, next to the two branches that apply it, because the client's payload
 * builder needs the same answer and a second copy of it would drift.
 */
export function crossingExpr(
  source: string,
  attr: Attribute,
  value: readonly AttributeValuePart[],
  signals: ReadonlySet<string>,
): string {
  const reactive = reactiveName(source, value, signals);
  return reactive !== undefined ? `${reactive}()` : attrExpr(source, attr);
}

/**
 * What a binding writes as an ATTRIBUTE of its element — its name and value parts — or
 * `null` when it writes none. The one place the rule lives, because the two branches must
 * agree about it byte for byte.
 *
 * In fudic a property is written with a dot and an attribute is written plain, and BUG-16
 * makes that the whole of it: on a COMPONENT both reach the output, because level 1 is HTML
 * with no JS and the host's attributes are the only place a value can live there. On a
 * NATIVE tag a `.prop` is what it always was — a DOM property, client hookup, absent from
 * SSR — so it writes nothing here.
 */
function attributeOf(
  b: Binding,
  isComponent: boolean,
): { readonly name: string; readonly value: readonly AttributeValuePart[] } | null {
  if (b.type === 'attr') return b;
  if (b.type === 'property' && isComponent) return b;
  return null;
}

/**
 * The props object literal a component host is rendered/created with: its `.prop` bindings,
 * and only those.
 *
 * A plain attribute is NOT in here (BUG-16 §4.2). It is HTML's own vocabulary — `id`,
 * `class`, `slot`, `data-*` — and handing it to the child's `render` made a component
 * declare props for things that were never its own.
 */
export function componentPropsExpr(
  source: string,
  el: ElementNode,
  signals: ReadonlySet<string>,
): string {
  const entries: string[] = [];
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, source).value;
    if (b.type !== 'property') continue;
    // A bare `.disabled` is `true` (decision 44), which is what the projection checks it
    // as; `attrExpr` would give the `""` an attribute wants and a prop does not.
    const expr = b.value.length === 0 ? 'true' : crossingExpr(source, attr, b.value, signals);
    entries.push(`${JSON.stringify(b.name)}: ${expr}`);
  }
  return `{ ${entries.join(', ')} }`;
}

/**
 * Whether any attribute of this element becomes a write that depends on an EXPRESSION —
 * an interpolated value, or a `class:` binding folded into `class`.
 *
 * The client emit asks before it walks: a write of that kind belongs to `$a()`, which
 * create and update both call (BUG-12 §3.3), and a construct that holds one has to have
 * its condition replicated there. A purely literal attribute is markup, and markup is
 * fabricated once.
 */
export function hasValueAttrs(source: string, el: ElementNode, host: HostContext): boolean {
  return el.attributes.some((attr) => {
    const b = classifyAttribute(attr, source).value;
    if (b.type === 'class') return true;
    const written = attributeOf(b, host.isComponent);
    return written !== null && !written.value.every((p) => p.type === 'attribute-text');
  });
}

/**
 * Where the writes of one element land. Two methods and not one because the two branches
 * disagree about what a value costs: the server body runs once, so it can drop the
 * expression straight into the statement, while `$a()` runs again on every update and has
 * to hold on to what it last wrote (BUG-12 §4.2).
 *
 * `once` is a write whose statement reads the value a single time — the sink may inline
 * the expression. `bound` reads it several times, so it MUST be bound to a name first.
 */
export interface ValueSink {
  /**
   * Whether the statements this sink emits run more than once. A write that can happen
   * again is a write that can have to be taken back: only then does an attribute that
   * turned falsy need removing.
   */
  readonly repeats: boolean;
  once(expr: string, write: (value: string) => string): void;
  bound(expr: string, write: (value: string) => string): void;
}

/** The single-body sink: the server, and the fabricate body inside a `@foreach`. */
export function inlineSink(w: CodeWriter): ValueSink {
  return {
    repeats: false,
    once: (expr, write) => {
      w.line(write(expr));
    },
    bound: (expr, write) => {
      w.line(`{ const $v = ${expr}; ${write('$v')} }`);
    },
  };
}

/**
 * Write the statements for one element's attributes. `class` is composed LAST, from the
 * static base plus every `class:` binding, so a single attribute carries the lot.
 *
 * `fixed` takes what is known at build time; `values` takes what depends on an expression.
 * They are the same writer on the server and two different bodies on the client, which is
 * the whole reason this module is shared: the two branches must agree byte for byte on
 * what an attribute becomes, and one of them now writes it twice.
 *
 * `host.isComponent` decides one thing only, and `attributeOf` owns it: whether a `.prop` is
 * an attribute of this element. Event / bus / ref bindings are never written here — they are
 * hookup, which belongs in the controller's `$s()`, and they are absent from SSR entirely.
 */
export function writeElementAttrs(
  source: string,
  el: ElementNode,
  v: string,
  fixed: CodeWriter,
  linker: AssetLinker,
  host: HostContext,
  values: ValueSink = inlineSink(fixed),
): void {
  const slice = (sp: Span): string => source.slice(sp.start, sp.end);
  let baseClass: string | undefined;
  const classExprs: string[] = [];
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, source).value;
    if (b.type === 'class') {
      classExprs.push(`(${slice(b.value.expr)}) && ${JSON.stringify(b.className)}`);
      continue;
    }
    const written = attributeOf(b, host.isComponent);
    if (written === null) continue; // event / bus / ref, and `.prop` on a native tag
    const isStatic = written.value.every((p) => p.type === 'attribute-text');
    if (isStatic) {
      const literal = written.value.map((p) => attrText(p as AttributeText)).join('');
      if (written.name === 'class') baseClass = literal;
      else if (linker.enabled && isAssetAttr(el.name, written.name)) {
        // A static, relative asset URL: reference the import Vite resolves (SDD-19 §4.5);
        // a missing/absolute one stays a literal (`maybeRef` → null, missing → FUD0363).
        const binding = linker.maybeRef(literal);
        const value = binding ?? JSON.stringify(literal);
        fixed.line(`$dom.setAttr(${v}, ${JSON.stringify(written.name)}, ${value});`);
      } else {
        fixed.line(
          `$dom.setAttr(${v}, ${JSON.stringify(written.name)}, ${JSON.stringify(literal)});`,
        );
      }
    } else {
      // interpolated: omit when falsy (boolean attributes, decision 21), else set. A sink
      // that repeats also has to CLEAR it: a value that turned falsy on an update would
      // otherwise leave the attribute the previous value put there.
      const name = JSON.stringify(written.name);
      const clear = values.repeats ? ` else $dom.removeAttr(${v}, ${name});` : '';
      values.bound(
        crossingExpr(source, attr, written.value, host.signals),
        ($v) =>
          `if (${$v} === true) $dom.setAttr(${v}, ${name}, ''); ` +
          `else if (${$v} !== false && ${$v} != null) $dom.setAttr(${v}, ${name}, String(${$v}));${clear}`,
      );
    }
  }
  if (baseClass !== undefined || classExprs.length > 0) {
    const arr = [baseClass !== undefined ? JSON.stringify(baseClass) : null, ...classExprs].filter(
      (x) => x !== null,
    );
    const expr = `[${arr.join(', ')}].filter(Boolean).join(' ')`;
    // No `class:` binding means nothing in there can move: it is a literal, spelled long.
    if (classExprs.length === 0) fixed.line(`$dom.setAttr(${v}, 'class', ${expr});`);
    else values.once(expr, ($v) => `$dom.setAttr(${v}, 'class', ${$v});`);
  }
}
