/**
 * Markup codegen for the CLIENT branch (SDD-15 §4.3, §4.6). One walk over the AST writing
 * three bodies at once — fabricate, adopt and hook up — because computing them separately
 * is how they drift out of alignment, and alignment is the whole contract: `h` adopts
 * exactly the tree `c` (or the server) built.
 *
 * - **fabricate** — `$nX = $dom.element(...)`, attributes, and the assembly of every
 *   non-root relationship. The roots are collected in `$r` instead, so `m` — the mount
 *   closure — is the one that attaches them.
 * - **adopt** — an ELEMENT cursor: `$dom.firstElementChild` to enter a level,
 *   `$dom.nextElementSibling` to advance. Never `querySelector`, never `cloneNode`, never
 *   an index.
 * - **hook up** — the listeners of an element's `@event` / `bus:` bindings, which is the
 *   one body the two paths SHARE: `$s()` runs whichever way the instance came alive. It
 *   comes in through the same door as the other two because it is the same fact about the
 *   same element, and `attrs.ts` goes on ignoring those bindings — the split it describes
 *   between attribute and hookup does not change, it just stops having an empty side.
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
 * **Text is reached from the element beside it, never counted.** A run that needs a
 * reference is anchored to the cursor's `previousSibling` (or the level's last node when no
 * element is left). Runs are coalesced into one node each (`runs.ts`), which is exactly what
 * makes that anchor land: one emitted run, one DOM node.
 *
 * **Control flow is not written here.** The five constructs are blocks with a life of their
 * own (SDD-30) and go to the `BlockSink`: this module hands one the level it sits in, what
 * follows it and its anchor, and writes nothing about it itself.
 */

import type { HtmlContent, ElementNode, AttributeValuePart } from '../html/index.js';
import type { ControlNode } from '../control/index.js';
import type { RazorExpression } from '../at/index.js';
import type { Span } from '../types/index.js';
import { classifyAttribute } from '../binding/index.js';
import { CodeWriter, type LinePart } from './writer.js';
import { type AssetLinker } from './assets.js';
import {
  crossingExpr,
  reactiveName,
  writeElementAttrs,
  type HostContext,
  type ValueSink,
} from './attrs.js';
import { branchesOf } from './constructs.js';
import { freeReferences, type FragmentAst } from './scope.js';
import { isControlNode, markerSite } from './marker.js';
import { nestedSpaceMode, type SpaceMode } from './space.js';
import { emitItems, type EmitItem, type TextRun } from './runs.js';
import type { Prop } from './oxc-code.js';
import { busHandler, eventHandler, FUD_UNSUITABLE_HANDLER, type HookupContext } from './events.js';
import { errorDiag } from '../types/index.js';

const isControl = isControlNode;
const asControl = (node: HtmlContent): ControlNode => node as unknown as ControlNode;

/** Where one DOM level is being written: its parent on each path, and its element cursor. */
export interface Level {
  /** The variable a fabricated node joins; `null` at a root, where `$r` collects instead. */
  readonly fab: string | null;
  /** The parent node on the adopt path (`$shadow` at the component root, `$parent` in a block). */
  readonly dom: string;
  /** The level's element cursor, or `null` when no element can appear in it. */
  readonly cursor: string | null;
  /**
   * What the END of this level is, as an insertion anchor: `null` to append. A block body
   * ends where its own `$anchor` does — its nodes are the parent's children, so "after
   * everything I render" is "before what follows ME" (§3.4).
   */
  readonly end: string | null;
}

/** What a root of a walk is: one of its own nodes, or a construct nested at its level. */
export type RootItem =
  | { readonly kind: 'node'; readonly name: string }
  | { readonly kind: 'block'; readonly registry: string };

/**
 * What still lies ahead of an item in its level — the two facts an anchor depends on.
 * `element` is a GUARANTEE (an element outside any construct), so where it holds the
 * cursor cannot be null; `any` only says something ahead might still render a node.
 */
export interface Tail {
  readonly element: boolean;
  readonly any: boolean;
}

/** The tail of the last item of a level: a level ends at its parent's boundary. */
export const NOTHING_AHEAD: Tail = { element: false, any: false };

/** Where a construct sits, and everything the block emitter needs to place it (SDD-30 §3.4). */
export interface BlockSite {
  readonly level: Level;
  readonly tail: Tail;
  /**
   * The variable of the next node of the level, or `null` ⇒ append at the end. It is what
   * a row created by an update inserts before, and no marker is needed to find it.
   */
  readonly anchor: string | null;
  /** The whitespace mode in force where the construct is written (BUG-07 §4.4). */
  readonly space: SpaceMode;
  /** The bodies of the PARENT: where the create / adopt / mount / update lines go. */
  readonly bodies: ClientBodies;
  /**
   * Whether the block has to be mounted LATER, by `$m`, instead of during `c`.
   *
   * True at a root level, and it is not a preference: the siblings of a root are collected
   * in `$r` and only reach the tree when `$m` runs, so a block that inserted itself during
   * `c` would land ahead of every one of them. One level down the parent element already
   * exists and its children are appended in source order, so the block's turn is simply
   * its turn.
   */
  readonly deferredMount: boolean;
}

/** What the walk hands a control construct to. Implemented by `block.ts`. */
export interface BlockSink {
  /** Emit the construct, and give back the name of its live-instance registry (§3.6). */
  construct(node: ControlNode, at: BlockSite): string;
}

/**
 * The one anchor the DOM is given (§3.4): an empty comment between two interpolated runs
 * that only constructs separate.
 */
interface Marker {
  /** Index of the run in front, the one whose anchor the marker replaces. */
  readonly run: number;
  /** Index of the item the comment is written at — just before the constructs. */
  readonly at: number;
  /** The comment's own variable. */
  readonly name: string;
  /** The run in front, by variable. */
  readonly runName: string;
  /** What that run is stepped from on the adopt path; `null` ⇒ the level's first child. */
  readonly front: string | null;
}

/** A shared source of node variable names, so no two blocks of a file reuse one. */
export interface NodeIds {
  next(): string;
}

export function nodeIds(): NodeIds {
  let n = 0;
  return { next: () => `$n${n++}` };
}

/**
 * Whether this DOM LEVEL holds a node matching `pred`. A construct is not a level of its
 * own — its branches render into the same parent — so the walk descends into every branch
 * and stops at every element.
 */
function levelHas(children: readonly HtmlContent[], pred: (node: HtmlContent) => boolean): boolean {
  return children.some((child) => {
    if (pred(child)) return true;
    if (!isControl(child)) return false;
    return branchesOf(asControl(child)).some((branch) => levelHas(branch.body, pred));
  });
}

const isElement = (node: HtmlContent): boolean => node.type === 'element';

/**
 * The four bodies one walk fills. `fab` and `adopt` are the two alternative ways to end up
 * holding the same tree; `apply` and `hook` are the two things every instance does whichever
 * way it got there.
 */
export interface ClientBodies {
  /** `c` — create the nodes and assemble the structure. */
  readonly fab: CodeWriter;
  /** `h` — take the SSR nodes with an element cursor. */
  readonly adopt: CodeWriter;
  /** `$m` / `m` — put the roots in the tree, once they all exist. */
  readonly mount: CodeWriter;
  /** `$a` — put a value on a node. The ONLY body that does (BUG-12 §3.3). */
  readonly apply: CodeWriter;
  /** `$s` — hook up: the values a child receives, and the subscriptions that renew them. */
  readonly hook: CodeWriter;
  /** `u` — after `$a`, the reconciliation of every construct of this closure (§4.2). */
  readonly update: CodeWriter;
  /**
   * The declarations of the enclosing closure: `let $kN = []`, and every `const $bN = …`.
   *
   * A block function is declared where it can SEE — beside `$dom`, the props and the
   * `@code { @client }` — and that is what lets its signature carry only what an update can
   * bring it again (§3.1). A nested block lands in the closure of the block that holds it,
   * so its registry is per instance of that one and not per component.
   */
  readonly decls: CodeWriter;
  /**
   * The registries of every construct of this closure, in source order.
   *
   * `r()` walks them, and that is the second defect of §1 closing: nulling one variable per
   * node released one row of a loop and left the other N−1 — with every disposer they had
   * registered — hanging off a DOM the component no longer owns.
   */
  readonly registries: string[];
}

/**
 * What this component knows about the ones around it and about itself:
 *
 * - `childProps(tag)` — the prop order of a child component, or `undefined` when the tag is
 *   not a component. A parent needs its child's ORDER to compose the positional array `u`
 *   takes: the payload carries no schema, only values in the order the child destructures.
 * - `signals` — the names its own `@code` declares with `signal(...)`. It is what tells a
 *   reactive `.prop` from a constant one, and it is a lookup, not a heuristic.
 * - `moving` — every name whose value this component can see change: its props, the
 *   `@client` bindings it reassigns, and its signals. It is `signals` widened, and the
 *   widening is the whole of §4.6: a PROP is not a constant. A component two levels down a
 *   drilling chain hands its own child a value it received, and that value moves every time
 *   its parent updates it — a test that only asks "is it a signal?" reads it as a constant
 *   and hands it over once, forever.
 */
export interface ClientScope {
  childProps(tag: string): readonly Prop[] | undefined;
  readonly signals: ReadonlySet<string>;
  readonly moving: ReadonlySet<string>;
}

/** One slot of a child's positional payload: the expression, and where it can move from. */
interface Slot {
  readonly expr: string;
  /** The parent signal this value reads, when there is one; absent for a constant. */
  readonly signal?: string;
  /**
   * Whether this value can move WITHOUT a signal to subscribe to — a prop the parent
   * reassigns, a reassigned `@client` binding, or a compound expression that reads a signal
   * (`@(count() + 1)` is not a bare name, so it has no `signal` to hook onto either).
   *
   * `signal` and `changes` are the two halves of the same question and are deliberately
   * exclusive: what has a signal is renewed one slot at a time by `$sub` (BUG-18 §4.1), and
   * what only has `changes` is renewed in the update pass, with the whole tuple.
   */
  readonly changes: boolean;
}

/**
 * What the chunk turns out to need from `@fudic/core`, discovered while walking.
 * Shared by every emitter of a file — a block is a separate walk, but its import
 * line is the module's (SDD-31 §4.8, criterion §6.20).
 */
export interface CoreUsage {
  subscribes: boolean;
}

/** A file starts owing `@fudic/core` nothing but `FudicElement`. */
export function coreUsage(): CoreUsage {
  return { subscribes: false };
}

export interface MarkupOptions {
  readonly source: string;
  readonly bodies: ClientBodies;
  readonly scope: ClientScope;
  readonly linker: AssetLinker;
  readonly sink: BlockSink;
  readonly ids: NodeIds;
  /** Where this walk records what it made the module import. */
  readonly usage: CoreUsage;
  /** The template's JS and where an unsuitable handler is reported (§4.5). */
  readonly hookup: HookupContext;
  /** The whitespace mode in force where this walk starts (BUG-07 §4.4). */
  readonly space: SpaceMode;
  /**
   * Whether the roots of this walk need a reference each. A block's do: it moves and
   * removes them, and a static text run it cannot name is a node its `r()` would leave
   * behind. A component's do not — the browser takes its shadow root away whole.
   */
  readonly trackRoots?: boolean;
}

export class ClientMarkupEmitter {
  readonly #source: string;
  readonly #bodies: ClientBodies;
  readonly #fab: CodeWriter;
  readonly #adopt: CodeWriter;
  readonly #apply: CodeWriter;
  readonly #hook: CodeWriter;
  readonly #scope: ClientScope;
  readonly #linker: AssetLinker;
  readonly #sink: BlockSink;
  readonly #ids: NodeIds;
  readonly #usage: CoreUsage;
  readonly #hookup: HookupContext;
  readonly #trackRoots: boolean;
  readonly #nodes: string[] = [];
  readonly #rootItems: RootItem[] = [];
  #depth = 0;
  /** How many value writes `$a` owns so far — each one gets its own slot in `$w`. */
  #writes = 0;
  /** The whitespace mode of the node being emitted; `white-space` inherits (BUG-07 §4.4). */
  #space: SpaceMode;

  constructor(options: MarkupOptions) {
    this.#source = options.source;
    this.#bodies = options.bodies;
    this.#fab = options.bodies.fab;
    this.#adopt = options.bodies.adopt;
    this.#apply = options.bodies.apply;
    this.#hook = options.bodies.hook;
    this.#scope = options.scope;
    this.#linker = options.linker;
    this.#sink = options.sink;
    this.#ids = options.ids;
    this.#usage = options.usage;
    this.#hookup = options.hookup;
    this.#trackRoots = options.trackRoots ?? false;
    this.#space = options.space;
  }

  /** Whether this tag is a component of the graph. */
  #isComponent(tag: string): boolean {
    return this.#scope.childProps(tag) !== undefined;
  }

  /** Every node variable the walk created, for the closure's `let` header and for `r()`. */
  get nodes(): readonly string[] {
    return this.#nodes;
  }

  /** How many slots `$w` needs: one per value write, so each is compared against its own. */
  get writes(): number {
    return this.#writes;
  }

  /**
   * The roots of this walk, in document order — its own nodes and the constructs nested
   * among them. It is what `move` unrolls: reordering a block means placing every one of
   * its roots again, and a nested block's rows are as much its content as its own nodes.
   */
  get rootItems(): readonly RootItem[] {
    return this.#rootItems;
  }

  /**
   * One value write, guarded by what it last applied. `u` re-applies the WHOLE payload —
   * the array arrives entire and the props are positional — so the filter has to sit on
   * each write, not on the call: a component with ten props must not repaint ten nodes
   * because one signal moved. The comparison is a string against a string; the write it
   * saves is a DOM mutation.
   */
  #applyValue(value: readonly LinePart[], write: (v: string) => string): void {
    const slot = this.#writes++;
    this.#apply.mappedLine('$v = ', ...value, ';');
    this.#apply.line(`if ($v !== $w[${slot}]) { $w[${slot}] = $v; ${write('$v')} }`);
  }

  /**
   * Where an element's value writes go: always `$a`. Inside a block they go to the BLOCK's
   * `$a`, because a block instance owns its nodes for as long as it lives — which is what
   * closes the hole BUG-12 §3.3.c left open for the inside of a loop.
   */
  #sinkFor(): ValueSink {
    return {
      repeats: true,
      once: (expr, write) => this.#applyValue([expr], write),
      bound: (expr, write) => this.#applyValue([expr], write),
    };
  }

  /** What `attrs.ts` needs to know about the element it is writing: see `HostContext`. */
  #host(isComponent: boolean): HostContext {
    return { isComponent, signals: this.#scope.signals };
  }

  /** The component template: the direct children of the shadow root. */
  emitRoots(children: readonly HtmlContent[]): void {
    const cursor = this.#cursorFor(children);
    if (cursor !== null) this.#adopt.line(`let ${cursor} = $dom.firstElementChild($shadow);`);
    this.#items(this.#itemsOf(children), { fab: null, dom: '$shadow', cursor, end: null }, NOTHING_AHEAD);
  }

  /**
   * A block body. It is NOT a level of its own: its nodes are children of `$parent`, and
   * its element cursor comes in from the level it shares with its siblings (§4.3).
   */
  emitBlockBody(children: readonly HtmlContent[], cursor: string, tail: Tail): void {
    this.#items(this.#itemsOf(children), { fab: null, dom: '$parent', cursor, end: '$anchor' }, tail);
  }

  /** Whether the roots of THIS level are ones the walk has to be able to name again. */
  #tracked(level: Level): boolean {
    return this.#trackRoots && level.fab === null;
  }

  /** The cursor variable a level needs, or `null` when no element can appear in it. */
  #cursorFor(children: readonly HtmlContent[]): string | null {
    return levelHas(children, isElement) ? `$c${this.#depth}` : null;
  }

  #itemsOf(children: readonly HtmlContent[]): readonly EmitItem[] {
    return emitItems(this.#source, children, this.#space);
  }

  /**
   * Walk the items of a level.
   *
   * Two passes, and the first is not an optimization. Node variables are handed out BEFORE
   * anything is written because a construct needs the name of what FOLLOWS it — that name is
   * its anchor (§3.4), and it is the reason no marker has to be planted in the DOM. The
   * tails are computed backwards for the same reason: a run is located by what comes after
   * it, since the cursor has already passed everything before.
   */
  #items(items: readonly EmitItem[], level: Level, tail: Tail): void {
    const tails: Tail[] = [];
    let ahead = tail;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      tails[i] = ahead;
      const item = items[i]!;
      // A construct makes `any` true and `element` no truer: its body may render nothing.
      if (item.kind === 'node') {
        ahead = { element: ahead.element || isElement(item.node), any: true };
      }
    }

    const names = this.#namesFor(items, level);
    const marker = this.#markerFor(items, names);
    const anchors: (string | null)[] = [];
    let anchor: string | null = null;
    for (let i = items.length - 1; i >= 0; i -= 1) {
      anchors[i] = anchor;
      const name = names[i];
      // A construct is transparent as an anchor: consecutive blocks share the one behind
      // them, and the order between them is the order they were inserted in (§3.4).
      if (name !== undefined) anchor = name;
    }

    items.forEach((item, i) => {
      const at = tails[i]!;
      if (marker !== undefined && marker.at === i) this.#marker(marker, level);
      if (item.kind === 'run') {
        this.#run(item, level, at, names[i], marker?.run === i ? marker : undefined);
      } else if (isControl(item.node)) {
        const registry = this.#construct(asControl(item.node), level, at, anchors[i] ?? null);
        if (this.#tracked(level)) this.#rootItems.push({ kind: 'block', registry });
      } else {
        this.#node(item.node, level, names[i]);
      }
      const name = names[i];
      if (name !== undefined && this.#tracked(level)) this.#rootItems.push({ kind: 'node', name });
    });
  }

  /**
   * Hand out the node variables of a level, in source order.
   *
   * An element always takes one. A run takes one when it can be rewritten, when the level's
   * roots are tracked, or when a construct in front of it needs it as an anchor — a static
   * run with no name is a place an update could not insert before.
   */
  #namesFor(items: readonly EmitItem[], level: Level): (string | undefined)[] {
    // Set the moment a construct is passed, cleared by the first node that can be named:
    // that node is the construct's anchor, and a construct with no anchor is one an update
    // could only append to.
    let wanted = false;
    return items.map((item) => {
      if (item.kind === 'node' && isControl(item.node)) {
        wanted = true;
        return undefined;
      }
      if (item.kind === 'node') {
        if (item.node.type !== 'element') return undefined;
        wanted = false;
        return this.#fresh();
      }
      if (!(item.interpolated || this.#tracked(level) || wanted)) return undefined;
      wanted = false;
      return this.#fresh();
    });
  }

  /**
   * The ONE marker the DOM gets, where `marker.ts` says it goes — the rule is stated there
   * because the SERVER has to paint the same comment, and a marker on one side only is
   * worse than none: the two trees would differ by a node.
   *
   * What this adds is what only the client needs: the comment's own variable, and the node
   * the run in front is stepped from on the adopt path.
   */
  #markerFor(
    items: readonly EmitItem[],
    names: readonly (string | undefined)[],
  ): Marker | undefined {
    const site = markerSite(items);
    if (site === undefined) return undefined;
    const front = site.run === 0 ? null : names[site.run - 1]!;
    return { ...site, name: this.#fresh(), front, runName: names[site.run]! };
  }

  /** The empty comment, on both paths: created here, found from the run in front of it. */
  #marker(marker: Marker, level: Level): void {
    this.#fab.line(`${marker.name} = $dom.comment('');`);
    this.#place(marker.name, level.fab);
    this.#adopt.line(`${marker.name} = $dom.nextSibling(${marker.runName});`);
    if (this.#tracked(level)) this.#adopt.line(`$r.push(${marker.name});`);
  }

  #node(node: HtmlContent, level: Level, name: string | undefined): void {
    if (node.type === 'element') this.#element(node, level, name!);
    // Comments, `@code` and layout directives: no client markup.
  }

  /**
   * One coalesced text run. A run with no name is created inline — it is markup nobody will
   * ever rewrite, move or remove, and a reference to it would only be weight in the `let`
   * header.
   */
  #run(
    run: TextRun,
    level: Level,
    tail: Tail,
    name: string | undefined,
    marker: Marker | undefined,
  ): void {
    if (name === undefined) {
      const open = level.fab === null ? '$r.push($dom.text(' : `$dom.append(${level.fab}, $dom.text(`;
      this.#fab.mappedLine(open, ...run.value, '));');
      return;
    }
    if (run.interpolated) {
      // The node is structure and the text is state: fabricate one, let `$a` write the
      // other. Create and update then converge on the same statement, so they cannot
      // disagree about what this run says.
      this.#fab.line(`${name} = $dom.text('');`);
      this.#applyValue(run.value, ($v) => `$dom.setText(${name}, ${$v});`);
    } else {
      this.#fab.mappedLine(`${name} = $dom.text(`, ...run.value, ');');
    }
    this.#place(name, level.fab);
    this.#adopt.line(`${name} = ${marker === undefined ? this.#anchor(level, tail) : this.#front(marker, level)};`);
    if (this.#tracked(level)) this.#adopt.line(`$r.push(${name});`);
  }

  /**
   * How the adopt path finds a run: from the element beside it. The cursor sits on the next
   * element of the level, so the run is its previous sibling; with no element left ahead,
   * the run is the last node of the level.
   */
  /** The forward step the marked run takes instead of an anchor it cannot use. */
  #front(marker: Marker, level: Level): string {
    return marker.front === null
      ? `$dom.firstChild(${level.dom})`
      : `$dom.nextSibling(${marker.front})`;
  }

  #anchor(level: Level, tail: Tail): string {
    if (tail.element) return `$dom.previousSibling(${level.cursor!})`;
    if (tail.any && level.cursor !== null) {
      return `${level.cursor} ? $dom.previousSibling(${level.cursor}) : $dom.lastChild(${level.dom})`;
    }
    return `$dom.lastChild(${level.dom})`;
  }

  #fresh(): string {
    const v = this.#ids.next();
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

  #element(el: ElementNode, level: Level, v: string): void {
    const outer = this.#space;
    this.#space = nestedSpaceMode(outer, el);
    this.#fab.line(`${v} = $dom.element(${JSON.stringify(el.name)});`);
    if (this.#isComponent(el.name)) {
      // A child component host: fabricate it and hang its light DOM, but do NOT open its
      // shadow or drive its controller. Who downloads a child's chunk, and in which order
      // its instances come alive, is the runtime's decision (SDD-17), not the parent's.
      // `data-fud-adopt` carries the style specifier the shared sheet is keyed by (SDD-18 D-6).
      this.#fab.line(`$dom.setAttr(${v}, 'data-fud-adopt', ${JSON.stringify(el.name)});`);
      // The host's own attributes, same as the server writes them (BUG-16 §4.1): the two
      // branches have to agree byte for byte, or `h` adopts a tree it does not recognise.
      writeElementAttrs(
        this.#source,
        el,
        v,
        this.#fab,
        this.#linker,
        this.#host(true),
        this.#sinkFor(),
      );
      this.#childValues(el, v);
    } else {
      writeElementAttrs(
        this.#source,
        el,
        v,
        this.#fab,
        this.#linker,
        this.#host(false),
        this.#sinkFor(),
      );
    }
    this.#listeners(el, v);
    // Take the element the cursor is on, then advance it — before descending, so the
    // levels below are walked with this element already accounted for.
    this.#adopt.line(`${v} = ${level.cursor!}; ${level.cursor} = $dom.nextElementSibling(${level.cursor});`);
    if (this.#tracked(level)) this.#adopt.line(`$r.push(${v});`);
    this.#children(el, v);
    this.#space = outer;
    this.#place(v, level.fab); // parent last: a node is filled before it joins the tree
  }

  /**
   * The listeners of one element, written into `$s()` (§4.5).
   *
   * `$nX && …` because a node may not be there: the DOM is the authority on position, and a
   * projection can leave a variable unassigned. Inside a block the body written to is the
   * BLOCK's, so a `@click` in a row of a `@foreach` registers in the `s()` of that row, with
   * its own nodes and its own `$d` — there is no special case to write here, and §6.17 falls
   * out of the scope rather than out of a rule of this emitter.
   */
  #listeners(el: ElementNode, v: string): void {
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, this.#source).value;
      if (b.type !== 'event' && b.type !== 'bus') continue;
      const at = b.value.expr;
      const handler =
        b.type === 'event'
          ? eventHandler(this.#source, at, this.#hookup)
          : busHandler(this.#source, at, this.#hookup);
      if (handler === undefined) {
        // The emit does not throw (§5): the binding is dropped and the page still emits.
        this.#hookup.diagnostics.push(
          errorDiag(
            FUD_UNSUITABLE_HANDLER,
            'event binding value must be a reference, a lambda or a call: this expression cannot be subscribed',
            at,
          ),
        );
        continue;
      }
      if (b.type === 'event') {
        this.#hook.line(`${v} && $d.push($dom.event(${v}, ${JSON.stringify(b.name)}, ${handler}));`);
        continue;
      }
      // A bus subscription reads no node — the listener goes on the document and the
      // context is the host — so it carries no `$nX &&` guard. What it does read is
      // `$host`, and saying so here is what makes the factory declare it.
      this.#hookup.hostUsed = true;
      this.#hook.line(`$d.push($dom.bus($host, ${this.#channel(b.eventName)}, ${handler}));`);
    }
  }

  /**
   * The channel a `bus:` subscribes, as an expression evaluated in `s()`.
   *
   * `bus:carrito` is the string; `bus:(EVENTOS.carrito)` is the expression, read where the
   * subscription happens. Both produce a listener that works. Resolving the name STATICALLY
   * (decision 28.c) is a different question and not this one: all it decides is who goes
   * into `fud-bus`, which is a fact about the page. A name that cannot be resolved is not
   * an error and still emits its listener — we do not protect what we cannot see.
   */
  #channel(name: string | RazorExpression): string {
    return typeof name === 'string' ? JSON.stringify(name) : `(${this.#slice(name.expr)})`;
  }

  /**
   * The values a child host receives, written into `$s()` — the point create and hydrate
   * converge on, so the child is served whichever way this instance came alive.
   *
   * The property of a signal is the PARENT's: decision 84 lets only a value cross the
   * shadow boundary, and SDD-17 makes it structural, because the props of a hydrated
   * instance travel serialized in `fud-state` and a signal is a function with a live `Set`
   * inside. A child therefore cannot subscribe to anything; the owner of the value is the
   * one who writes it again, once at hookup and once per notification.
   *
   * A host with nothing that can move among its values emits NOTHING (decision 75): a
   * constant crossed once, it is already in the markup the server painted, and `const` is
   * its exact semantics — a channel for it would be scaffolding around a value that cannot
   * move.
   *
   * **And "cannot move" is not "is not a signal".** That reading is what broke prop
   * drilling: in `padre → hijo → nieto`, the signal is the ROOT's, so only the first hop had
   * a channel. For `hijo`, `count` is a prop — no signal, so no channel, so `nieto` was
   * handed its value once at hookup and never heard from again, and the chain died at depth
   * one. What a prop has instead of a channel is the update pass: it is reassigned by `u`,
   * and right after that is exactly when the child has to be told (§4.2).
   */
  #childValues(el: ElementNode, v: string): void {
    const slots = this.#slots(el);
    const bound = [...slots.values()];
    if (!bound.some((s) => s.signal !== undefined || s.changes)) return;

    // The slots in the CHILD's declared order: the payload carries no schema, so the index
    // is the whole contract. A slot the parent does not bind is a hole in both passes.
    const cells = this.#scope.childProps(el.name)!.map((p) => slots.get(p.name));

    // The handover is DENSE, and stays dense (BUG-18 §4.1): every prop has to land, and the
    // array is the exact mirror of the `Object.values` the server serialized. The two
    // leading holes are `$dom` and `$shadow`, which the parent does not own.
    const last = cells.reduce((n, cell, i) => (cell === undefined ? n : i + 1), 0);
    const initial = cells
      .slice(0, last)
      .map((cell) => (cell === undefined ? '' : cell.signal === undefined ? cell.expr : `${cell.signal}()`))
      .join(', ');
    this.#hook.line(`${v}.u([, , ${initial}]);`);

    // What has no signal to subscribe to is renewed by the UPDATE PASS: the same handover,
    // recomposed from bindings that were just reassigned. Dense like the handover it repeats
    // — a prop that did not move recomputes to the same string and the child's own `$w`
    // drops it, so the cost of the extra slots is a comparison, not a DOM write.
    //
    // This is what makes drilling work to any depth. The pass reaches one level, that level
    // reassigns its props and runs its own update, which reaches the next: the chain advances
    // by one hop per level, in order, and no level needs to know how far the signal is.
    if (bound.some((s) => s.changes)) this.#bodies.update.line(`${v}.u([, , ${initial}]);`);

    for (const source of new Set(bound.flatMap((s) => (s.signal !== undefined ? [s.signal] : [])))) {
      // The update is SPARSE: one subscription per signal, and each writes ONLY the slots
      // that signal feeds. No `peek()` of the others, and a constant prop — `const` in the
      // sense decision 75 means — never travels again after the handover.
      //
      // Two statements and not an expression, and that is forced: there is no sparse array
      // literal. `[, , , $v]` is DENSE in its first three holes, each holding `undefined`,
      // which is precisely the value the child reads as "apply the default".
      const writes = cells
        .flatMap((cell, i) => (cell?.signal === source ? [`$p[${i + 2}] = $v;`] : []))
        .join(' ');
      // `$sub`, not a method: subscription left the `Signal` surface in SDD-31 §4.0, and
      // the alias lives in the `$` reserve so the author cannot shadow it — as does `$p`.
      this.#usage.subscribes = true;
      this.#hook.line(`$d.push($sub(${source}, ($v) => { const $p = []; ${writes} ${v}.u($p); }));`);
    }
  }

  /**
   * The values a host hands its child, by prop name: its `.prop` bindings, and only those
   * — the same set `componentPropsExpr` sends by SSR (BUG-16 §4.2). A plain attribute is
   * HTML's own vocabulary and belongs to the host, not to the child's contract.
   *
   * Which of them can MOVE is not a guess, and it is asked in two steps. A value whose
   * source is exactly the name of a `signal(...)` this component declares is reactive and
   * has a channel of its own. Everything else is asked the WEAKER question — does it read
   * anything that moves? — and only what answers no to both is a constant: `.prop="info"`
   * has no expression at all, and `.total="@(1 + 1)"` reads nothing that can change.
   */
  #slots(el: ElementNode): Map<string, Slot> {
    const out = new Map<string, Slot>();
    for (const attr of el.attributes) {
      const b = classifyAttribute(attr, this.#source).value;
      if (b.type !== 'property') continue;
      const naked = reactiveName(this.#source, b.value, this.#scope.signals);
      if (naked !== undefined) {
        out.set(b.name, { expr: naked, signal: naked, changes: false });
      } else {
        const expr =
          b.value.length === 0
            ? 'true'
            : crossingExpr(this.#source, attr, b.value, this.#scope.signals);
        out.set(b.name, { expr, changes: this.#reads(b.value) });
      }
    }
    return out;
  }

  /**
   * Whether an attribute value reads anything this component can see move.
   *
   * By FREE references, not by text: `.count="@count"` and `.label="@(count + 1)"` have to
   * answer the same, and a name a lambda inside the expression declares itself is not this
   * component's. It is the same question `block.ts` asks to decide a block's parameters, and
   * deliberately the same function — a second way of answering it would drift, and the drift
   * is silent: a child that stops being updated looks exactly like a child with nothing new.
   */
  #reads(value: readonly AttributeValuePart[]): boolean {
    const asts: FragmentAst[] = [];
    for (const part of value) {
      if (part.type === 'razor-expression') asts.push(this.#hookup.template.ast(part.expr));
    }
    if (asts.length === 0) return false;
    return freeReferences(asts).some((name) => this.#scope.moving.has(name));
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
    this.#items(this.#itemsOf(el.children), { fab: v, dom: v, cursor, end: null }, NOTHING_AHEAD);
    if (cursor !== null) this.#adopt.dedent().line('}');
    this.#depth -= 1;
  }

  /** One control construct: a block with a life of its own, handed over whole (SDD-30). */
  #construct(node: ControlNode, level: Level, tail: Tail, anchor: string | null): string {
    return this.#sink.construct(node, {
      level,
      tail,
      anchor,
      space: this.#space,
      bodies: this.#bodies,
      deferredMount: level.fab === null,
    });
  }
}
