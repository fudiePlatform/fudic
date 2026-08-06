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

import type { ElementNode, Attribute, AttributeText } from '../html/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Span } from '../types/index.js';
import { classifyAttribute } from '../binding/index.js';
import type { CodeWriter } from './writer.js';
import type { AssetLinker } from './assets.js';

/**
 * A single-URL asset attribute the linker rewrites: `src`/`poster` on any element, or
 * `href` on a `<link>` (stylesheet/icon) — never `<a href>`, which is navigation.
 */
export const isAssetAttr = (element: string, attribute: string): boolean =>
  attribute === 'src' || attribute === 'poster' || (attribute === 'href' && element === 'link');

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
  if (texts.length === parts.length) return JSON.stringify(texts.map((p) => p.value).join(''));
  // Not all literal, and a single part: that part is the expression.
  if (parts.length === 1) return `(${slice((parts[0] as RazorExpression).expr)})`;
  const template = parts
    .map((p) =>
      p.type === 'attribute-text'
        ? p.value.replace(/[`\\$]/gu, '\\$&')
        : '${' + slice(p.expr) + '}',
    )
    .join('');
  return '`' + template + '`';
}

/** The props object literal a component host is rendered/created with. */
export function componentPropsExpr(source: string, el: ElementNode): string {
  const entries: string[] = [];
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, source).value;
    if (b.type === 'attr') entries.push(`${JSON.stringify(b.name)}: ${attrExpr(source, attr)}`);
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
export function hasValueAttrs(source: string, el: ElementNode): boolean {
  return el.attributes.some((attr) => {
    const b = classifyAttribute(attr, source).value;
    if (b.type === 'class') return true;
    return b.type === 'attr' && !b.value.every((p) => p.type === 'attribute-text');
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
 * Event / property / bus / ref bindings are not written: they are hookup, which belongs in
 * the controller's `$s()`, and they are absent from SSR entirely.
 */
export function writeElementAttrs(
  source: string,
  el: ElementNode,
  v: string,
  fixed: CodeWriter,
  linker: AssetLinker,
  values: ValueSink = inlineSink(fixed),
): void {
  const slice = (sp: Span): string => source.slice(sp.start, sp.end);
  let baseClass: string | undefined;
  const classExprs: string[] = [];
  for (const attr of el.attributes) {
    const b = classifyAttribute(attr, source).value;
    if (b.type === 'class') {
      classExprs.push(`(${slice(b.value.expr)}) && ${JSON.stringify(b.className)}`);
    } else if (b.type === 'attr') {
      const isStatic = b.value.every((p) => p.type === 'attribute-text');
      if (isStatic) {
        const literal = b.value.map((p) => (p as { value: string }).value).join('');
        if (b.name === 'class') baseClass = literal;
        else if (linker.enabled && isAssetAttr(el.name, b.name)) {
          // A static, relative asset URL: reference the import Vite resolves (SDD-19 §4.5);
          // a missing/absolute one stays a literal (`maybeRef` → null, missing → FUD0363).
          const binding = linker.maybeRef(literal);
          const value = binding ?? JSON.stringify(literal);
          fixed.line(`$dom.setAttr(${v}, ${JSON.stringify(b.name)}, ${value});`);
        } else {
          fixed.line(`$dom.setAttr(${v}, ${JSON.stringify(b.name)}, ${JSON.stringify(literal)});`);
        }
      } else {
        // interpolated: omit when falsy (boolean attributes, decision 21), else set. A sink
        // that repeats also has to CLEAR it: a value that turned falsy on an update would
        // otherwise leave the attribute the previous value put there.
        const name = JSON.stringify(b.name);
        const clear = values.repeats ? ` else $dom.removeAttr(${v}, ${name});` : '';
        values.bound(
          attrExpr(source, attr),
          ($v) =>
            `if (${$v} === true) $dom.setAttr(${v}, ${name}, ''); ` +
            `else if (${$v} !== false && ${$v} != null) $dom.setAttr(${v}, ${name}, String(${$v}));${clear}`,
        );
      }
    } // event / property / bus / ref: not emitted here
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
