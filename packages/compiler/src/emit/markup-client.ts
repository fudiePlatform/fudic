/**
 * Markup codegen for the CLIENT branch (SDD-15 §4.3, §4.6). One walk over the AST writing
 * two bodies at once — fabricate and adopt — because computing them separately is how they
 * drift out of alignment, and alignment is the whole contract: `h` adopts exactly the tree
 * `c` (or the server) built.
 *
 * - **fabricate** — `$nX = $dom.element(...)`, attributes, and the assembly of every
 *   non-root relationship. The roots are collected in `$r` instead, so `m` — the private
 *   mount closure — is the one that attaches them to the shadow.
 * - **adopt** — an ELEMENT cursor: `$dom.firstElementChild` to enter a level,
 *   `$dom.nextElementSibling` to advance. Never `querySelector`, never `cloneNode`, never
 *   an index.
 *
 * **Why the cursor counts elements and not nodes.** A tree that goes through HTML and back
 * does not preserve text-node boundaries: `text("a")` beside `text("b")` serializes to `ab`
 * and the parser hands back ONE node. A cursor that counts every node is therefore off by
 * one the first time a closed `@if` leaves two whitespace texts adjacent — which is nearly
 * every template. Elements have no such ambiguity: they survive the round trip one for one,
 * and the same condition takes the same branch on both paths, so the cursor advances in
 * step. Formatting whitespace is not something to locate; it is something nobody will ever
 * touch.
 *
 * **Text is reached from the element beside it, never counted — and only when it can
 * change.** A run carrying an interpolation gets a variable, anchored to the cursor's
 * `previousSibling` (or the level's last node when no element is left). A static run gets
 * none: nobody rewrites `hello`. Runs are coalesced into one node each (`runs.ts`), which
 * is exactly what makes that anchor land: one emitted run, one DOM node.
 *
 * The one shape this does not resolve: two interpolated runs separated only by a construct
 * that may render nothing (`@a @if (x) { } @b`). When it renders nothing the two runs ARE a
 * single node in the DOM and no traversal can tell them apart — that needs a real block
 * anchor, which belongs to the blocks SDD (`u`), not here.
 */

import type { HtmlContent, ElementNode } from '../html/index.js';
import type { IfNode, ForeachNode } from '../control/index.js';
import type { Span } from '../types/index.js';
import { CodeWriter } from './writer.js';
import { type AssetLinker } from './assets.js';
import { writeElementAttrs } from './attrs.js';
import { nestedSpaceMode, type SpaceMode } from './space.js';
import { emitItems, type EmitItem, type TextRun } from './runs.js';

// A control construct is stored as its base RazorConstruct; recover the concrete node.
const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asForeach = (node: HtmlContent): ForeachNode => node as unknown as ForeachNode;

/** Where one DOM level is being written: its parent on each path, and its element cursor. */
interface Level {
  /** The variable a fabricated node joins; `null` at the root, where `$r` collects instead. */
  readonly fab: string | null;
  /** The parent node on the adopt path (`$shadow` at the root). */
  readonly dom: string;
  /** The level's element cursor, or `null` when no element can appear in it. */
  readonly cursor: string | null;
}

/**
 * What still lies ahead of an item in its level — the two facts an anchor depends on.
 * `element` is a GUARANTEE (an element outside any construct), so where it holds the
 * cursor cannot be null; `any` only says something ahead might still render a node.
 */
interface Tail {
  readonly element: boolean;
  readonly any: boolean;
}

/** The tail of the last item of a level: a level ends at its parent's boundary. */
const NOTHING_AHEAD: Tail = { element: false, any: false };

/**
 * Whether this DOM LEVEL holds a node matching `pred`. A construct is not a level of its
 * own — its branches render into the same parent — so the walk descends into `@if`/`@foreach`
 * bodies and stops at every element.
 */
function levelHas(children: readonly HtmlContent[], pred: (node: HtmlContent) => boolean): boolean {
  return children.some((child) => {
    if (pred(child)) return true;
    if (child.type === 'if') {
      const node = asIf(child);
      if (node.branches.some((branch) => levelHas(branch.body, pred))) return true;
      return node.elseBody !== undefined && levelHas(node.elseBody, pred);
    }
    if (child.type === 'foreach') return levelHas(asForeach(child).body, pred);
    return false;
  });
}

const isElement = (node: HtmlContent): boolean => node.type === 'element';

/** What the adopt path takes a reference to: elements, and the text that can be rewritten. */
const isAdopted = (node: HtmlContent): boolean =>
  node.type === 'element' || node.type === 'razor-expression';

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
    const cursor = this.#cursorFor(children);
    if (cursor !== null) this.#adopt.line(`let ${cursor} = $dom.firstElementChild($shadow);`);
    this.#items(this.#itemsOf(children), { fab: null, dom: '$shadow', cursor }, NOTHING_AHEAD);
  }

  /** The cursor variable a level needs, or `null` when no element can appear in it. */
  #cursorFor(children: readonly HtmlContent[]): string | null {
    return levelHas(children, isElement) ? `$c${this.#depth}` : null;
  }

  #itemsOf(children: readonly HtmlContent[]): readonly EmitItem[] {
    return emitItems(this.#source, children, this.#space);
  }

  /**
   * Walk the items of a level. The tails are computed BACKWARDS first, because a run is
   * anchored by what comes after it: the cursor has already passed everything before.
   */
  #items(items: readonly EmitItem[], level: Level, tail: Tail): void {
    const tails: Tail[] = [];
    let ahead = tail;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      tails[i] = ahead;
      const item = items[i]!;
      // A construct makes `any` true and `element` no truer: its body may render nothing.
      if (item.kind === 'node') ahead = { element: ahead.element || isElement(item.node), any: true };
    }
    items.forEach((item, i) => {
      const at = tails[i]!;
      if (item.kind === 'run') this.#run(item, level, at);
      else this.#node(item.node, level, at);
    });
  }

  #node(node: HtmlContent, level: Level, tail: Tail): void {
    switch (node.type) {
      case 'element':
        this.#element(node, level);
        return;
      case 'if':
        // A construct whose branches hold nothing anyone references is emitted on the
        // fabricate path only: it renders markup, but there is nothing to adopt from it,
        // and it cannot move the cursor either.
        this.#if(asIf(node), level, tail, levelHas([node], isAdopted));
        return;
      case 'foreach':
        this.#foreach(asForeach(node), level, tail, levelHas([node], isAdopted));
        return;
      default:
        return; // comments, @code, layout directives: no client markup
    }
  }

  /**
   * One coalesced text run. A static run is created inline — no variable, no adoption:
   * it is markup nobody will ever rewrite, and a reference to it would only be weight in
   * the `let` header and in `r()`.
   */
  #run(run: TextRun, level: Level, tail: Tail): void {
    if (!run.interpolated) {
      const open = level.fab === null ? '$r.push($dom.text(' : `$dom.append(${level.fab}, $dom.text(`;
      this.#fab.mappedLine(open, ...run.value, '));');
      return;
    }
    const v = this.#fresh();
    this.#fab.mappedLine(`${v} = $dom.text(`, ...run.value, ');');
    this.#place(v, level.fab);
    this.#adopt.line(`${v} = ${this.#anchor(level, tail)};`);
  }

  /**
   * How the adopt path finds an interpolated run: from the element beside it. The cursor
   * sits on the next element of the level, so the run is its previous sibling; with no
   * element left ahead, the run is the last node of the level.
   */
  #anchor(level: Level, tail: Tail): string {
    if (tail.element) return `$dom.previousSibling(${level.cursor!})`;
    if (tail.any && level.cursor !== null) {
      return `${level.cursor} ? $dom.previousSibling(${level.cursor}) : $dom.lastChild(${level.dom})`;
    }
    return `$dom.lastChild(${level.dom})`;
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
  #place(v: string, fab: string | null): void {
    this.#fab.line(fab === null ? `$r.push(${v});` : `$dom.append(${fab}, ${v});`);
  }

  #element(el: ElementNode, level: Level): void {
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
    // Take the element the cursor is on, then advance it — before descending, so the
    // levels below are walked with this element already accounted for.
    this.#adopt.line(`${v} = ${level.cursor!}; ${level.cursor} = $dom.nextElementSibling(${level.cursor});`);
    this.#children(el, v);
    this.#space = outer;
    this.#place(v, level.fab); // parent last: a node is filled before it joins the tree
  }

  /** Descend into an element: a level of its own, with its own cursor. */
  #children(el: ElementNode, v: string): void {
    if (el.children.length === 0) return;
    this.#depth += 1;
    const cursor = this.#cursorFor(el.children);
    if (cursor !== null) {
      // The braces are here to scope the cursor `let`, and for nothing else: a level that
      // declares none writes no block, because an empty `{ }` is bytes that say nothing.
      this.#adopt.line('{').indent().line(`let ${cursor} = $dom.firstElementChild(${v});`);
    }
    this.#items(this.#itemsOf(el.children), { fab: v, dom: v, cursor }, NOTHING_AHEAD);
    if (cursor !== null) this.#adopt.dedent().line('}');
    this.#depth -= 1;
  }

  /**
   * `@if` is emitted into BOTH bodies and that costs nothing: `c` and `h` are alternative
   * paths, so a condition written twice is still evaluated once per instance. With the same
   * props and the same initial state it picks the same branch, which is why the payload must
   * carry the whole state and not the projection that got painted (§3.3) — and why the
   * cursor stays in step across the branch.
   */
  #if(node: IfNode, level: Level, tail: Tail, adopts: boolean): void {
    node.branches.forEach((branch, i) => {
      const head = i === 0 ? 'if' : '} else if';
      const inner = this.#slice(branch.header.inner);
      this.#fab.mappedLine(`${head} (`, { text: inner, src: branch.header.inner.start }, ') {');
      if (adopts) this.#adopt.line(`${head} (${inner}) {`);
      this.#indent();
      this.#items(this.#itemsOf(branch.body), level, tail);
      this.#dedent();
    });
    if (node.elseBody !== undefined) {
      this.#fab.line('} else {');
      if (adopts) this.#adopt.line('} else {');
      this.#indent();
      this.#items(this.#itemsOf(node.elseBody), level, tail);
      this.#dedent();
    }
    this.#fab.line('}');
    if (adopts) this.#adopt.line('}');
  }

  #foreach(loop: ForeachNode, level: Level, tail: Tail, adopts: boolean): void {
    const inner = this.#slice(loop.header.inner);
    this.#fab.mappedLine('for (', { text: inner, src: loop.header.inner.start }, ') {');
    if (adopts) this.#adopt.line(`for (${inner}) {`);
    this.#indent();
    this.#items(this.#itemsOf(loop.body), level, tail);
    this.#dedent();
    this.#fab.line('}');
    if (adopts) this.#adopt.line('}');
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
