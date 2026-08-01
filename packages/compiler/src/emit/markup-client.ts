/**
 * Markup codegen for the CLIENT branch (SDD-15 §4.3, §4.6). One walk over the AST writing
 * two bodies at once — fabricate and adopt — because computing them separately is how they
 * drift out of alignment, and alignment is the whole contract: `h` adopts, node by node,
 * exactly the tree `c` (or the server) built.
 *
 * - **fabricate** — `$nX = $dom.element(...)`, attributes, and the assembly of every
 *   non-root relationship. The roots are collected in `$r` instead, so `m` — the private
 *   mount closure — is the one that attaches them to the shadow.
 * - **adopt** — a CURSOR walk: `$dom.firstChild` to enter a level, `$dom.nextSibling` to
 *   advance. Never `querySelector`, never `cloneNode`, never an index.
 *
 * **The cursor counts every node, text included.** `nextSibling` does not skip text, and
 * that is deliberate: §4.9 collapses a run of whitespace to one space but never removes a
 * text node, so server and client positions coincide by construction. The `$shadow.children[i]`
 * of the SDD's own example would NOT work — `children` skips exactly the text nodes the
 * emit guarantees are there.
 *
 * **Control flow is emitted into both bodies, and that costs nothing.** `c` and `h` are
 * alternative paths — an instance takes one or the other — so a condition written twice is
 * still evaluated once per instance. With the same props and the same initial state it
 * picks the same branch, which is why the payload must carry the whole state and not just
 * the projection that got painted (§3.3).
 */

import type { HtmlContent, ElementNode } from '../html/index.js';
import type { IfNode, ForeachNode } from '../control/index.js';
import type { Span } from '../types/index.js';
import { CodeWriter } from './writer.js';
import { type AssetLinker } from './assets.js';
import { writeElementAttrs } from './attrs.js';
import { collapseSpace, nestedSpaceMode, type SpaceMode } from './space.js';

// A control construct is stored as its base RazorConstruct; recover the concrete node.
const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asForeach = (node: HtmlContent): ForeachNode => node as unknown as ForeachNode;

export class ClientMarkupEmitter {
  readonly #source: string;
  readonly #fab: CodeWriter;
  readonly #adopt: CodeWriter;
  readonly #isComponent: (tag: string) => boolean;
  readonly #linker: AssetLinker;
  readonly #nodes: string[] = [];
  #id = 0;
  #depth = 0;
  /** The whitespace mode of the node being emitted; `white-space` inherits (BUG-07 §4.4). */
  #space: SpaceMode;

  constructor(
    source: string,
    fab: CodeWriter,
    adopt: CodeWriter,
    isComponent: (tag: string) => boolean,
    linker: AssetLinker,
    space: SpaceMode = 'collapse',
  ) {
    this.#source = source;
    this.#fab = fab;
    this.#adopt = adopt;
    this.#isComponent = isComponent;
    this.#linker = linker;
    this.#space = space;
  }

  /** Every node variable the walk created, for the closure's `let` header and for `r()`. */
  get nodes(): readonly string[] {
    return this.#nodes;
  }

  /** Emit both bodies for the component template: the direct children of the shadow root. */
  emitRoots(children: readonly HtmlContent[]): void {
    if (children.length === 0) return;
    this.#adopt.line('let $c0 = $dom.firstChild($shadow);');
    for (const child of children) this.#emit(child, null, '$c0');
  }

  #emit(node: HtmlContent, parent: string | null, cursor: string): void {
    switch (node.type) {
      case 'text': {
        const v = this.#fresh();
        const value = this.#space === 'preserve' ? node.value : collapseSpace(node.value);
        this.#fab.line(`${v} = $dom.text(${JSON.stringify(value)});`);
        this.#place(v, parent);
        this.#step(v, cursor);
        return;
      }
      case 'razor-expression': {
        const v = this.#fresh();
        this.#fab.mappedLine(
          `${v} = $dom.text(String((`,
          { text: this.#slice(node.expr), src: node.expr.start },
          `) ?? ''));`,
        );
        this.#place(v, parent);
        this.#step(v, cursor);
        return;
      }
      case 'element':
        this.#element(node, parent, cursor);
        return;
      case 'if':
        this.#if(asIf(node), parent, cursor);
        return;
      case 'foreach':
        this.#foreach(asForeach(node), parent, cursor);
        return;
      default:
        return; // comments, @code, layout directives: no client markup
    }
  }

  #fresh(): string {
    const v = `$n${this.#id++}`;
    this.#nodes.push(v);
    return v;
  }

  #slice(sp: Span): string {
    return this.#source.slice(sp.start, sp.end);
  }

  /** Assemble a fabricated node: into its parent, or into the root list `m` will mount. */
  #place(v: string, parent: string | null): void {
    this.#fab.line(parent === null ? `$r.push(${v});` : `$dom.append(${parent}, ${v});`);
  }

  /** Take the node the cursor is on, and advance the cursor one sibling. */
  #step(v: string, cursor: string): void {
    this.#adopt.line(`${v} = ${cursor}; ${cursor} = $dom.nextSibling(${cursor});`);
  }

  #element(el: ElementNode, parent: string | null, cursor: string): void {
    const v = this.#fresh();
    const outer = this.#space;
    this.#space = nestedSpaceMode(outer, el);
    this.#fab.line(`${v} = $dom.element(${JSON.stringify(el.name)});`);
    if (this.#isComponent(el.name)) {
      // A child component host: fabricate it and hang its light DOM, but do NOT open its
      // shadow or drive its controller. Who downloads a child's chunk, and in which order
      // its instances come alive, is the runtime's decision (SDD-17), not the parent's.
      // `data-adopt` carries the style specifier the shared sheet is keyed by (SDD-18 D-6).
      this.#fab.line(`$dom.setAttr(${v}, 'data-adopt', ${JSON.stringify(el.name)});`);
    } else {
      writeElementAttrs(this.#source, el, v, this.#fab, this.#linker);
    }
    this.#step(v, cursor); // adopt this node before descending into it
    this.#children(el, v);
    this.#space = outer;
    this.#place(v, parent); // parent last: a node is filled before it joins the tree
  }

  /** Walk an element's children with a cursor of their own, one level deeper. */
  #children(el: ElementNode, v: string): void {
    if (el.children.length === 0) return;
    this.#depth += 1;
    const inner = `$c${this.#depth}`;
    this.#adopt.line('{').indent().line(`let ${inner} = $dom.firstChild(${v});`);
    for (const child of el.children) this.#emit(child, v, inner);
    this.#adopt.dedent().line('}');
    this.#depth -= 1;
  }

  #if(node: IfNode, parent: string | null, cursor: string): void {
    node.branches.forEach((branch, i) => {
      const head = i === 0 ? 'if' : '} else if';
      const inner = this.#slice(branch.header.inner);
      this.#fab.mappedLine(`${head} (`, { text: inner, src: branch.header.inner.start }, ') {');
      this.#adopt.line(`${head} (${inner}) {`);
      this.#indent();
      for (const child of branch.body) this.#emit(child, parent, cursor);
      this.#dedent();
    });
    if (node.elseBody) {
      this.#fab.line('} else {');
      this.#adopt.line('} else {');
      this.#indent();
      for (const child of node.elseBody) this.#emit(child, parent, cursor);
      this.#dedent();
    }
    this.#fab.line('}');
    this.#adopt.line('}');
  }

  #foreach(loop: ForeachNode, parent: string | null, cursor: string): void {
    const inner = this.#slice(loop.header.inner);
    this.#fab.mappedLine('for (', { text: inner, src: loop.header.inner.start }, ') {');
    this.#adopt.line(`for (${inner}) {`);
    this.#indent();
    for (const child of loop.body) this.#emit(child, parent, cursor);
    this.#dedent();
    this.#fab.line('}');
    this.#adopt.line('}');
  }

  #indent(): void {
    this.#fab.indent();
    this.#adopt.indent();
  }

  #dedent(): void {
    this.#fab.dedent();
    this.#adopt.dedent();
  }
}
