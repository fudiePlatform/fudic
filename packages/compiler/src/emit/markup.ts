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

import type { HtmlContent, ElementNode } from '../html/index.js';
import type { IfNode, ForeachNode } from '../control/index.js';
import type { RenderSectionNode } from '../layout/index.js';
import type { Span } from '../types/index.js';
import { CodeWriter } from './writer.js';
import { type AssetLinker } from './assets.js';
import { componentPropsExpr, writeElementAttrs } from './attrs.js';
import { collapseSpace, nestedSpaceMode, type SpaceMode } from './space.js';

/** `render` + PascalCase of a `prefix-name` tag: `app-button` → `renderAppButton`. */
export const renderName = (tag: string): string =>
  'render' + tag.split('-').map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : '')).join('');

/** Wrap a CSS/text body in a template literal, escaping backticks, backslashes and `${`. */
export const tpl = (s: string): string => '`' + s.replace(/[`\\$]/gu, '\\$&') + '`';

export { isAssetAttr } from './attrs.js';

// A control construct is stored as its base RazorConstruct; recover the concrete node.
const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asForeach = (node: HtmlContent): ForeachNode => node as unknown as ForeachNode;
const asRenderSection = (node: HtmlContent): RenderSectionNode => node as unknown as RenderSectionNode;

export class MarkupEmitter {
  readonly #source: string;
  readonly #w: CodeWriter;
  readonly #isComponent: (tag: string) => boolean;
  readonly #linker: AssetLinker;
  readonly #slots: string | undefined;
  readonly #used = new Set<string>();
  #id = 0;
  /** The whitespace mode of the node being emitted; `white-space` inherits (BUG-07 §4.4). */
  #space: SpaceMode;

  /**
   * `slots` is the name of the layout's slots object (SDD-21 §4.5). When given, the layout
   * directives resolve to calls on it — `@RenderBody()` becomes `route.body($dom, parent)`.
   * When absent (a page, a component), a directive emits nothing: it was already reported
   * as out of place by SDD-10, and the emit must not invent markup for it.
   *
   * `space` is the mode AROUND the nodes this emitter walks: a component's own `<style>`
   * can put its whole template in a preserving context, and a page body starts in the
   * default one. Everything below it is derived per element by `nestedSpaceMode`.
   */
  constructor(
    source: string,
    w: CodeWriter,
    isComponent: (tag: string) => boolean,
    linker: AssetLinker,
    slots?: string,
    space: SpaceMode = 'collapse',
  ) {
    this.#source = source;
    this.#w = w;
    this.#isComponent = isComponent;
    this.#linker = linker;
    this.#slots = slots;
    this.#space = space;
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
        // Collapsed here, on the AST, not by a pass over the generated HTML (BUG-07 §4.1).
        // A run becomes ONE space and the node always survives — never trimmed, never
        // dropped: `collapseSpace` says what that protects.
        const value = this.#space === 'preserve' ? node.value : collapseSpace(node.value);
        this.#w.line(`const ${v} = $dom.text(${JSON.stringify(value)}); $dom.append(${parent}, ${v});`);
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
      case 'render-body':
        // `@RenderBody()`: the route appends its nodes under the SAME parent, with the
        // layout's own `$dom` — one tree, one serialization (SDD-21 §4.5).
        if (this.#slots) this.#w.line(`${this.#slots}.body($dom, ${parent});`);
        return;
      case 'render-section': {
        if (this.#slots) {
          const name = asRenderSection(node).name;
          this.#w.line(`${this.#slots}.section(${JSON.stringify(name)}, $dom, ${parent});`);
        }
        return;
      }
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
    // `white-space` inherits, so the mode is a stack, not a per-node lookup: entering a
    // `<pre>` puts everything below it in preserve until the walk leaves again.
    const outer = this.#space;
    this.#space = nestedSpaceMode(outer, el);
    if (this.#isComponent(el.name)) {
      this.#used.add(el.name);
      const s = this.#fresh();
      this.#w.line(`const ${v} = $dom.element(${JSON.stringify(el.name)});`);
      // The <template>'s shadowrootadoptedstylesheets is consumed by the parser and gone
      // from the DOM; project the specifier onto the host as data-adopt so the style
      // polyfill can read it (SDD-18 D-6). The native attribute still rides the template.
      this.#w.line(`$dom.setAttr(${v}, 'data-adopt', ${JSON.stringify(el.name)});`);
      this.#w.line(`const ${s} = $dom.attachShadow(${v});`);
      this.#w.line(`${renderName(el.name)}($dom, ${s}, ${componentPropsExpr(this.#source, el)});`);
      for (const child of el.children) this.emit(child, v); // light DOM (projected by <slot>)
    } else {
      this.#w.line(`const ${v} = $dom.element(${JSON.stringify(el.name)});`);
      this.#elementAttrs(el, v);
      for (const child of el.children) this.emit(child, v);
    }
    this.#space = outer;
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
    writeElementAttrs(this.#source, el, v, this.#w, this.#linker);
  }
}
