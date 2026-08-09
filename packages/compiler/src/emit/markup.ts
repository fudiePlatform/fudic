/**
 * Markup codegen shared by the component template and the page body. `MarkupEmitter`
 * walks the AST once and writes the imperative build statements — fabricate a node, set
 * its attributes, build its children (which append themselves), then append it to its
 * parent — through the injected `Dom<N>` adapter. Component hosts get a shadow root and
 * a call to the child's `render`; light-DOM children are projected by `<slot>`.
 *
 * The five control-flow nodes (`@if`, `@switch`, `@foreach`, `@for`, `@while`) live in
 * `HtmlContent` as the base `RazorConstruct` (only `type` survives the union), but the parser
 * produced the concrete node. They are recovered by discriminant in `asIf` / `asLoop` /
 * `asSwitch` — the single, documented place the cast happens, instead of one at every use
 * site.
 */

import type { HtmlContent, ElementNode } from '../html/index.js';
import type { IfNode, SwitchNode } from '../control/index.js';
import type { RenderSectionNode } from '../layout/index.js';
import type { Span } from '../types/index.js';
import { CodeWriter } from './writer.js';
import { type AssetLinker } from './assets.js';
import { componentPropsExpr, writeElementAttrs, type HostContext } from './attrs.js';
import { nestedSpaceMode, type SpaceMode } from './space.js';
import { emitItems, type TextRun } from './runs.js';
import { markerSite } from './marker.js';
import { loopHead, type LoopNode } from './constructs.js';

/** `render` + PascalCase of a `prefix-name` tag: `app-button` → `renderAppButton`. */
export const renderName = (tag: string): string =>
  'render' + tag.split('-').map((s) => (s ? s[0]!.toUpperCase() + s.slice(1) : '')).join('');

/** Wrap a CSS/text body in a template literal, escaping backticks, backslashes and `${`. */
export const tpl = (s: string): string => '`' + s.replace(/[`\\$]/gu, '\\$&') + '`';

export { isAssetAttr } from './attrs.js';

// A control construct is stored as its base RazorConstruct; recover the concrete node.
const asIf = (node: HtmlContent): IfNode => node as unknown as IfNode;
const asLoop = (node: HtmlContent): LoopNode => node as unknown as LoopNode;
const asSwitch = (node: HtmlContent): SwitchNode => node as unknown as SwitchNode;
const asRenderSection = (node: HtmlContent): RenderSectionNode => node as unknown as RenderSectionNode;

/** Which painter takes a kind of content — `'none'` when the server writes nothing for it. */
type ServerRole = 'element' | 'if' | 'loop' | 'switch' | 'render-body' | 'render-section' | 'none';

/**
 * What the server paints for every kind of content — and the reason this is a TABLE.
 *
 * Its type names each member of `HtmlContent`, so a node type cannot be added to the AST
 * without this file deciding what the server does with it. The `default` this replaces
 * declared its silence as *«constructs with no server markup»* while three constructs that DO
 * have server markup fell through it (BUG-19 §2.1) — the same shape BUG-14 §5 found in the
 * emit, and the same answer it left in `runs.ts`: a total table cannot leave the next one out.
 *
 * Everything mapped to `'none'` paints nothing HERE, each for its own reason, written beside
 * it. None of them is a hole waiting to be filled by omission.
 */
const SERVER_ROLE: Record<HtmlContent['type'], ServerRole> = {
  element: 'element',
  if: 'if',
  foreach: 'loop',
  for: 'loop',
  while: 'loop',
  switch: 'switch',
  'render-body': 'render-body',
  'render-section': 'render-section',
  // Coalesced into a text run by `emitItems` before the dispatch ever sees them: their markup
  // is `#run`'s, and reaching this table would mean the grouping changed underneath.
  text: 'none',
  'at-escape': 'none',
  'razor-expression': 'none',
  // Author comments do not travel to the output. The one comment the DOM ever gets is the
  // marker of `marker.ts`, planted by `emitChildren` and by nobody else (SDD-30 §3.4).
  comment: 'none',
  'razor-comment': 'none',
  // `@raw(…)` is an interpolation that is not escaped (decision 18); the emit has no consumer
  // for it until SDD-07 fixes the escape semantics. Same state `runs.ts` leaves it in.
  'raw-expression': 'none',
  // Author JS, not markup: `@{ … }` and `@code { … }` are hoisted by `module.ts`.
  'inline-code': 'none',
  code: 'none',
  // A `@section` is collected by SDD-21 through another door — the layout reads it by name
  // and calls it back where `@RenderSection` sits; painting it in place would render it twice.
  section: 'none',
  // The component's `<style>` body is the component's stylesheet (`module.ts`), and a `<script>`
  // body is opaque author text: neither is a node this walk fabricates.
  'style-content': 'none',
  'raw-text': 'none',
  // Document-level lexical nodes. The page's doctype is written by the serializer, not by build
  // statements, and CDATA only exists inside foreign content.
  doctype: 'none',
  cdata: 'none',
  // `@RenderHead()` is resolved by the page assembler (SDD-21), not by the markup walk.
  'render-head': 'none',
  // Degraded nodes: an orphan `@else` (FUD0073) and a construct with no handler (FUD0055).
  // Both were already reported; inventing markup for them would paint over the diagnostic.
  else: 'none',
  'unhandled-construct': 'none',
};

export class MarkupEmitter {
  readonly #source: string;
  readonly #w: CodeWriter;
  readonly #isComponent: (tag: string) => boolean;
  readonly #linker: AssetLinker;
  readonly #slots: string | undefined;
  /** The names this component declares with `signal(...)`: decision 84, see `crossingExpr`. */
  readonly #signals: ReadonlySet<string>;
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
    signals: ReadonlySet<string> = new Set(),
  ) {
    this.#source = source;
    this.#w = w;
    this.#isComponent = isComponent;
    this.#linker = linker;
    this.#slots = slots;
    this.#space = space;
    this.#signals = signals;
  }

  /** The child component tags rendered so far, in first-use order (for ES imports). */
  get used(): ReadonlySet<string> {
    return this.#used;
  }

  /**
   * Emit the build statements for a child list, appending each under `parent`.
   *
   * The list is walked as ITEMS, not as nodes: adjacent text and interpolation siblings
   * are coalesced into one run, because that is the tree the browser will hand back after
   * the markup makes the round trip (see `runs.ts`). Emitting them one by one would build
   * a server tree the client cannot adopt.
   */
  emitChildren(children: readonly HtmlContent[], parent: string): void {
    const items = emitItems(this.#source, children, this.#space);
    // The one comment the DOM ever gets (SDD-30 §3.4). It is painted HERE too, and by the
    // same rule: two interpolated runs a block separates come back from HTML as one text
    // node, so the client plants a boundary — and a boundary the server did not paint is a
    // node of difference between the two trees, which is a hydration that adopts nothing.
    const marker = markerSite(items);
    items.forEach((item, i) => {
      if (marker !== undefined && marker.at === i) {
        const v = this.#fresh();
        this.#w.line(`const ${v} = $dom.comment(''); $dom.append(${parent}, ${v});`);
      }
      if (item.kind === 'run') this.#run(item, parent);
      else this.#emit(item.node, parent);
    });
  }

  /** One coalesced text run — one node, because that is what the parser will give back. */
  #run(run: TextRun, parent: string): void {
    const v = this.#fresh();
    // Collapsed here, on the AST, not by a pass over the generated HTML (BUG-07 §4.1).
    // A run becomes ONE space and the node always survives — never trimmed, never
    // dropped: `collapseSpace` says what that protects.
    this.#w.mappedLine(`const ${v} = $dom.text(`, ...run.value, `); $dom.append(${parent}, ${v});`);
  }

  /** Emit the build statements for a node and append it under `parent`. */
  #emit(node: HtmlContent, parent: string): void {
    switch (SERVER_ROLE[node.type]) {
      case 'element':
        this.#element(node as ElementNode, parent);
        return;
      case 'if':
        this.#if(asIf(node), parent);
        return;
      case 'loop':
        this.#loop(asLoop(node), parent);
        return;
      case 'switch':
        this.#switch(asSwitch(node), parent);
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
      case 'none':
        // Every silent kind is named in `SERVER_ROLE`, each with the reason it paints nothing.
        return;
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
      // The host's own attributes — its `.prop`s and its plain HTML ones (BUG-16 §4.1).
      // Level 1 is HTML with no JS, so this is the only place they can live.
      this.#elementAttrs(el, v, true);
      this.#w.line(`const ${s} = $dom.attachShadow(${v});`);
      this.#w.line(
        `${renderName(el.name)}($dom, ${s}, ${componentPropsExpr(this.#source, el, this.#signals)});`,
      );
      this.emitChildren(el.children, v); // light DOM (projected by <slot>)
    } else {
      this.#w.line(`const ${v} = $dom.element(${JSON.stringify(el.name)});`);
      this.#elementAttrs(el, v, false);
      this.emitChildren(el.children, v);
    }
    this.#space = outer;
    this.#w.line(`$dom.append(${parent}, ${v});`);
  }

  #if(node: IfNode, parent: string): void {
    node.branches.forEach((branch, i) => {
      const head = i === 0 ? 'if' : '} else if';
      this.#w.mappedLine(`${head} (`, { text: this.#slice(branch.header.inner), src: branch.header.inner.start }, ') {');
      this.#w.indent();
      this.emitChildren(branch.body, parent);
      this.#w.dedent();
    });
    if (node.elseBody) {
      this.#w.line('} else {');
      this.#w.indent();
      this.emitChildren(node.elseBody, parent);
      this.#w.dedent();
    }
    this.#w.line('}');
  }

  /**
   * `@foreach` / `@for` / `@while` — one loop, three headers.
   *
   * The header is spliced WHOLE from the source (decision 93) by the same `loopHead` the
   * client uses, and anchored at the author's offset. The body goes out under the SAME
   * `parent`: a block is not a level of the DOM. Its node variables are `const` inside the
   * loop's braces, so every turn declares its own and there is nothing else to do — the
   * server builds and serializes, it does not reconcile.
   *
   * The `key` is NOT read here, and that is the whole difference between the two branches:
   * row identity belongs to the client's reconciliation (§4.4).
   */
  #loop(loop: LoopNode, parent: string): void {
    const head = loopHead(loop, this.#source);
    // `while (` or `for (` — the keyword holds no parenthesis, so the first one is the head's.
    const open = head.slice(0, head.indexOf('(') + 1);
    this.#w.mappedLine(open, { text: this.#slice(loop.header.inner), src: loop.header.inner.start }, ') {');
    this.#w.indent();
    this.emitChildren(loop.body, parent);
    this.#w.dedent();
    this.#w.line('}');
  }

  /**
   * `@switch` — one arm per `case`, in source order, `default` included.
   *
   * Two things the shape depends on. `break` is written in EVERY arm, the last one too:
   * decision 14 says there is no fall-through and each `SwitchCase` carries an independent
   * body, so without it one match would paint two arms. And every arm gets braces, because
   * the body declares `const $nN` and the lexical scope of a bare `case` is the whole
   * `switch` — the ids are unique per emission, so today nothing would collide, and the
   * braces are there so it does not depend on that (SDD-30 §4.1).
   */
  #switch(node: SwitchNode, parent: string): void {
    this.#w.mappedLine(
      'switch (',
      { text: this.#slice(node.header.inner), src: node.header.inner.start },
      ') {',
    );
    this.#w.indent();
    for (const branch of node.cases) {
      if (branch.test === undefined) this.#w.line('default: {');
      else this.#w.mappedLine('case ', { text: this.#slice(branch.test), src: branch.test.start }, ': {');
      this.#w.indent();
      this.emitChildren(branch.body, parent);
      this.#w.line('break;');
      this.#w.dedent();
      this.#w.line('}');
    }
    this.#w.dedent();
    this.#w.line('}');
  }

  #elementAttrs(el: ElementNode, v: string, isComponent: boolean): void {
    const host: HostContext = { isComponent, signals: this.#signals };
    writeElementAttrs(this.#source, el, v, this.#w, this.#linker, host);
  }
}
