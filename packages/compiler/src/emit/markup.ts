/**
 * Markup codegen shared by the component template and the page body. `MarkupEmitter`
 * walks the AST once and writes the imperative build statements — fabricate a node, set
 * its attributes, build its children (which append themselves), then append it to its
 * parent — through the injected `Dom<N>` adapter. Component hosts get a shadow root and
 * a call to the child's `render`; light-DOM children are projected by `<slot>`.
 *
 * Control-flow nodes (`@if`/`@foreach`) live in `HtmlContent` as the base `RazorConstruct`
 * (only `type` survives the union), but the parser produced the concrete node. They are
 * recovered by discriminant in `asIf` / `asForeach` — the single, documented place the
 * cast happens, instead of one at every use site.
 */

import type { HtmlContent, ElementNode, Attribute } from '../html/index.js';
import type { IfNode, ForeachNode } from '../control/index.js';
import type { Span } from '../types/index.js';
import { classifyAttribute } from '../binding/index.js';
import { CodeWriter } from './writer.js';
import { type AssetLinker } from './assets.js';

/** `render` + PascalCase of a `prefix-name` tag: `app-button` → `renderAppButton`. */
export const renderName = (tag: string): string =>
  'render' + tag.split('-').map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : '')).join('');

/** Wrap a CSS/text body in a template literal, escaping backticks, backslashes and `${`. */
export const tpl = (s: string): string => '`' + s.replace(/[`\\$]/gu, '\\$&') + '`';

/**
 * A single-URL asset attribute the linker rewrites: `src`/`poster` on any element, or
 * `href` on a `<link>` (stylesheet/icon) — never `<a href>`, which is navigation. Shared
 * by the body codegen and the page `<head>` passthrough.
 */
export const isAssetAttr = (element: string, attribute: string): boolean =>
  attribute === 'src' || attribute === 'poster' || (attribute === 'href' && element === 'link');

// A control construct is stored as its base RazorConstruct; recover the concrete node.
const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asForeach = (node: HtmlContent): ForeachNode => node as unknown as ForeachNode;

export class MarkupEmitter {
  readonly #source: string;
  readonly #w: CodeWriter;
  readonly #isComponent: (tag: string) => boolean;
  readonly #linker: AssetLinker;
  readonly #used = new Set<string>();
  #id = 0;

  constructor(source: string, w: CodeWriter, isComponent: (tag: string) => boolean, linker: AssetLinker) {
    this.#source = source;
    this.#w = w;
    this.#isComponent = isComponent;
    this.#linker = linker;
  }

  /** The child component tags rendered so far, in first-use order (for ES imports). */
  get used(): ReadonlySet<string> {
    return this.#used;
  }

  /** Emit the build statements for a node and append it under `parent`. */
  emit(node: HtmlContent, parent: string): void {
    switch (node.type) {
      case 'text': {
        const v = this.#fresh();
        this.#w.line(`const ${v} = $dom.text(${JSON.stringify(node.value)}); $dom.append(${parent}, ${v});`);
        return;
      }
      case 'razor-expression': {
        const v = this.#fresh();
        this.#w.mappedLine(
          `const ${v} = $dom.text(String((`,
          { text: this.#slice(node.expr), src: node.expr.start },
          `) ?? '')); $dom.append(${parent}, ${v});`,
        );
        return;
      }
      case 'element':
        this.#element(node, parent);
        return;
      case 'if':
        this.#if(asIf(node), parent);
        return;
      case 'foreach':
        this.#foreach(asForeach(node), parent);
        return;
      default:
        return; // comments, @code, and constructs with no server markup
    }
  }

  #fresh(): string {
    return `$n${this.#id++}`;
  }

  #slice(sp: Span): string {
    return this.#source.slice(sp.start, sp.end);
  }

  #element(el: ElementNode, parent: string): void {
    const v = this.#fresh();
    if (this.#isComponent(el.name)) {
      this.#used.add(el.name);
      const s = this.#fresh();
      this.#w.line(`const ${v} = $dom.element(${JSON.stringify(el.name)});`);
      // The <template>'s shadowrootadoptedstylesheets is consumed by the parser and gone
      // from the DOM; project the specifier onto the host as data-adopt so the style
      // polyfill can read it (SDD-18 D-6). The native attribute still rides the template.
      this.#w.line(`$dom.setAttr(${v}, 'data-adopt', ${JSON.stringify(el.name)});`);
      this.#w.line(`const ${s} = $dom.attachShadow(${v});`);
      this.#w.line(`${renderName(el.name)}($dom, ${s}, ${this.#componentProps(el)});`);
      for (const child of el.children) this.emit(child, v); // light DOM (projected by <slot>)
    } else {
      this.#w.line(`const ${v} = $dom.element(${JSON.stringify(el.name)});`);
      this.#elementAttrs(el, v);
      for (const child of el.children) this.emit(child, v);
    }
    this.#w.line(`$dom.append(${parent}, ${v});`);
  }

  #if(node: IfNode, parent: string): void {
    node.branches.forEach((branch, i) => {
      const head = i === 0 ? 'if' : '} else if';
      this.#w.mappedLine(`${head} (`, { text: this.#slice(branch.header.inner), src: branch.header.inner.start }, ') {');
      this.#w.indent();
      for (const child of branch.body) this.emit(child, parent);
      this.#w.dedent();
    });
    if (node.elseBody) {
      this.#w.line('} else {');
      this.#w.indent();
      for (const child of node.elseBody) this.emit(child, parent);
      this.#w.dedent();
    }
    this.#w.line('}');
  }

  #foreach(loop: ForeachNode, parent: string): void {
    this.#w.mappedLine('for (', { text: this.#slice(loop.header.inner), src: loop.header.inner.start }, ') {');
    this.#w.indent();
    for (const child of loop.body) this.emit(child, parent);
    this.#w.dedent();
    this.#w.line('}');
  }

  #elementAttrs(el: ElementNode, v: string): void {
    let baseClass: string | undefined;
    const classExprs: string[] = [];
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, this.#source).value;
      if (b.type === 'class') {
        classExprs.push(`(${this.#slice(b.value.expr)}) && ${JSON.stringify(b.className)}`);
      } else if (b.type === 'attr') {
        const isStatic = b.value.every((p) => p.type === 'attribute-text');
        if (isStatic) {
          const literal = b.value.map((p) => (p as { value: string }).value).join('');
          if (b.name === 'class') baseClass = literal;
          else if (this.#isAssetAttr(el, b.name)) {
            // A static, relative asset URL: reference the import Vite resolves (SDD-19 §4.5);
            // a missing/absolute one stays a literal (`maybeRef` → null, missing → FUD0363).
            const binding = this.#linker.maybeRef(literal);
            const value = binding ?? JSON.stringify(literal);
            this.#w.line(`$dom.setAttr(${v}, ${JSON.stringify(b.name)}, ${value});`);
          } else this.#w.line(`$dom.setAttr(${v}, ${JSON.stringify(b.name)}, ${JSON.stringify(literal)});`);
        } else {
          // interpolated: omit when falsy (boolean attributes, decision 21), else set.
          const name = JSON.stringify(b.name);
          this.#w.line(
            `{ const $a = ${this.#attrExpr(attr)}; if ($a === true) $dom.setAttr(${v}, ${name}, ''); ` +
              `else if ($a !== false && $a != null) $dom.setAttr(${v}, ${name}, String($a)); }`,
          );
        }
      } // event / property / bus / ref: not emitted for SSR
    }
    if (baseClass !== undefined || classExprs.length > 0) {
      const arr = [baseClass !== undefined ? JSON.stringify(baseClass) : null, ...classExprs].filter(
        (x) => x !== null,
      );
      this.#w.line(`$dom.setAttr(${v}, 'class', [${arr.join(', ')}].filter(Boolean).join(' '));`);
    }
  }

  /** A single-URL asset attribute the linker should rewrite: `src`/`poster`, or `<link href>`. */
  #isAssetAttr(el: ElementNode, name: string): boolean {
    return this.#linker.enabled && isAssetAttr(el.name, name);
  }

  #componentProps(el: ElementNode): string {
    const entries: string[] = [];
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, this.#source).value;
      if (b.type === 'attr') entries.push(`${JSON.stringify(b.name)}: ${this.#attrExpr(attr)}`);
    }
    return `{ ${entries.join(', ')} }`;
  }

  /** JS expression for an attribute's value (string literal, lone `@expr`, or template). */
  #attrExpr(attr: Attribute): string {
    const parts = attr.value as ReadonlyArray<{ type: string; value?: string; expr?: Span }>;
    if (parts.every((p) => p.type === 'attribute-text')) {
      return JSON.stringify(parts.map((p) => p.value ?? '').join(''));
    }
    if (parts.length === 1 && parts[0]!.type === 'razor-expression') {
      return `(${this.#slice(parts[0]!.expr!)})`;
    }
    const template = parts
      .map((p) =>
        p.type === 'attribute-text'
          ? (p.value ?? '').replace(/[`\\$]/gu, '\\$&')
          : '${' + this.#slice(p.expr!) + '}',
      )
      .join('');
    return '`' + template + '`';
  }
}
