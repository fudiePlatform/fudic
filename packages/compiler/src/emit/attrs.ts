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

import { decodeEntities, type ElementNode, type Attribute, type AttributeText } from '../html/index.js';
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
 * Write the `setAttr` statements for one element. `class` is composed LAST, from the
 * static base plus every `class:` binding, so a single attribute carries the lot.
 *
 * Event / property / bus / ref bindings are not written: they are hookup, which belongs in
 * the controller's `s()`, and they are absent from SSR entirely.
 */
export function writeElementAttrs(
  source: string,
  el: ElementNode,
  v: string,
  w: CodeWriter,
  linker: AssetLinker,
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
        const literal = b.value.map((p) => attrText(p as AttributeText)).join('');
        if (b.name === 'class') baseClass = literal;
        else if (linker.enabled && isAssetAttr(el.name, b.name)) {
          // A static, relative asset URL: reference the import Vite resolves (SDD-19 §4.5);
          // a missing/absolute one stays a literal (`maybeRef` → null, missing → FUD0363).
          const binding = linker.maybeRef(literal);
          const value = binding ?? JSON.stringify(literal);
          w.line(`$dom.setAttr(${v}, ${JSON.stringify(b.name)}, ${value});`);
        } else w.line(`$dom.setAttr(${v}, ${JSON.stringify(b.name)}, ${JSON.stringify(literal)});`);
      } else {
        // interpolated: omit when falsy (boolean attributes, decision 21), else set.
        const name = JSON.stringify(b.name);
        w.line(
          `{ const $a = ${attrExpr(source, attr)}; if ($a === true) $dom.setAttr(${v}, ${name}, ''); ` +
            `else if ($a !== false && $a != null) $dom.setAttr(${v}, ${name}, String($a)); }`,
        );
      }
    } // event / property / bus / ref: not emitted here
  }
  if (baseClass !== undefined || classExprs.length > 0) {
    const arr = [baseClass !== undefined ? JSON.stringify(baseClass) : null, ...classExprs].filter(
      (x) => x !== null,
    );
    w.line(`$dom.setAttr(${v}, 'class', [${arr.join(', ')}].filter(Boolean).join(' '));`);
  }
}
