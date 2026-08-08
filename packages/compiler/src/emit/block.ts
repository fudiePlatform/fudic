/**
 * Block render (SDD-30): the five control constructs, emitted as FUNCTIONS.
 *
 * Flattened in line — the way SDD-15 left them — a construct has no identity: the node
 * variables of a `@foreach` are the component's, reassigned every turn, so only the last row
 * survives the loop, `r()` releases one reference for N rows, and a write inside the body
 * has nothing stable to be re-applied to. None of that is an oversight; all three follow
 * from a block not being anything.
 *
 * Here each block is `($parent, $anchor, …deps) => ({ key, c, h, m, s, u, move, r })`,
 * declared inside the factory closure so it reads `$dom` and the `@code { @client }` through
 * lexical scope and takes by parameter only what an update can bring it again. With that,
 * the three defects are gone by construction rather than by care.
 *
 * Two things are deliberately NOT in the DOM: a marker for where a block ends, and an index.
 * The anchor is the variable of the next node of the level, which the walk already knows
 * (§3.4), and identity is the author's `key` (§3.5).
 */

import type { ControlNode } from '../control/index.js';
import { errorDiag, type Diagnostic, type Span } from '../types/index.js';
import type { OxcNode } from '../oxc/index.js';
import { CodeWriter } from './writer.js';
import type { AssetLinker } from './assets.js';
import { branchesOf, collectTemplateJs, isLoop, type Branch, type LoopNode } from './constructs.js';
import { freeReferences, patternBindings, type FragmentAst } from './scope.js';
import type { TemplateJs } from './oxc-code.js';
import {
  ClientMarkupEmitter,
  type BlockSink,
  type BlockSite,
  type ClientBodies,
  type ClientScope,
  type NodeIds,
  type RootItem,
} from './markup-client.js';

/** Everything a block needs that belongs to the FILE rather than to one construct. */
export interface BlockContext {
  readonly source: string;
  readonly scope: ClientScope;
  readonly linker: AssetLinker;
  readonly ids: NodeIds;
  /** The Oxc AST of every JS fragment of the template, by span (§3.3). */
  readonly template: TemplateJs;
  /** What the emit has to say about a construct. Never thrown (§5). */
  readonly diagnostics: Diagnostic[];
  nextBlock(): number;
  nextConstruct(): number;
}

/** A fresh set of the bodies one closure — a factory or a block — fills. */
export function newBodies(): ClientBodies {
  return {
    fab: new CodeWriter(),
    adopt: new CodeWriter(),
    mount: new CodeWriter(),
    apply: new CodeWriter(),
    hook: new CodeWriter(),
    update: new CodeWriter(),
    decls: new CodeWriter(),
    registries: [],
  };
}

export function blockContext(
  source: string,
  scope: ClientScope,
  linker: AssetLinker,
  ids: NodeIds,
  template: TemplateJs,
  diagnostics: Diagnostic[],
): BlockContext {
  let blocks = 0;
  let constructs = 0;
  return {
    source,
    scope,
    linker,
    ids,
    template,
    diagnostics,
    nextBlock: () => blocks++,
    nextConstruct: () => constructs++,
  };
}

/** What one block instance is called and what it takes. */
interface BuiltBlock {
  /** `$bN` — the function declared in the enclosing closure. */
  readonly name: string;
  /** The dependency parameters, in order: the header's bindings first (§3.3). */
  readonly params: readonly string[];
}

/**
 * The sink the markup walk hands every control construct to.
 *
 * One instance per SCOPE, not per file: a block's body is emitted by a sink of its own,
 * carrying the names its header declares, so a `@foreach` inside a `@foreach` knows that
 * the outer variable is something it must receive and the inner one something it declares.
 */
export class BlockEmitter implements BlockSink {
  readonly #ctx: BlockContext;
  /** Names in scope here whose value can change: props, mutable `@client`, and ancestors'. */
  readonly #changeable: ReadonlySet<string>;

  constructor(ctx: BlockContext, changeable: ReadonlySet<string>) {
    this.#ctx = ctx;
    this.#changeable = changeable;
  }

  /** Emit one construct; returns the name of its live-instance registry (§3.6). */
  construct(node: ControlNode, at: BlockSite): string {
    const id = this.#ctx.nextConstruct();
    const registry = `$k${id}`;
    const own = this.#headerBindings(node);
    const branches = branchesOf(node);
    const blocks = branches.map((branch) => this.#build(node, branch, own));

    at.bodies.registries.push(registry);
    at.bodies.decls.line(`let ${registry} = [];`);
    if (!isLoop(node)) at.bodies.decls.line(`let $x${id} = -1;`);
    for (const [i, branch] of branches.entries()) this.#declare(blocks[i]!, branch, node, at);

    const parent = at.level.fab ?? at.level.dom;
    if (isLoop(node)) this.#loop(node, blocks[0]!, id, registry, parent, at);
    else this.#branching(node, branches, blocks, id, registry, parent, at);
    at.bodies.update.line(`$u${id}();`);
    return registry;
  }

  // ------------------------------------------------------------------
  // Dependencies (§3.3)
  // ------------------------------------------------------------------

  /**
   * What the header of a loop DECLARES, in the order the pattern writes it.
   *
   * `@while` declares nothing and that is legal (§3.5): its key comes from what the body
   * mutates. A `@foreach`/`@for` that declares nothing has no iteration to name, so its key
   * can only be a constant and its rows can never be told apart — `FUD0543`.
   */
  #headerBindings(node: ControlNode): readonly string[] {
    if (!isLoop(node)) return [];
    if (node.type === 'while') return [];
    const header = this.#ctx.template.ast(node.header.inner);
    const root = Array.isArray(header) ? undefined : (header as OxcNode);
    const declaration = root === undefined ? undefined : root[node.type === 'foreach' ? 'left' : 'init'];
    const names = patternBindings(declarationTarget(declaration));
    if (names.length === 0) {
      this.#ctx.diagnostics.push(
        errorDiag(
          'FUD0543',
          'a loop header that declares no binding cannot have a key that identifies its rows',
          node.header.span,
        ),
      );
    }
    return names;
  }

  /**
   * The parameters of one branch: what its body consumes, minus what it declares itself and
   * minus everything that cannot change value.
   *
   * The filter is what keeps the signature honest in both directions. It cannot fall short —
   * every name of the component that an update can bring again is kept — and it cannot
   * overreach into a name that does not exist here, which would make the CALL a
   * `ReferenceError` rather than a harmless extra argument.
   */
  #dependencies(branch: Branch, node: ControlNode, own: readonly string[]): readonly string[] {
    const spans: Span[] = [];
    // The block's own key belongs to the block: it is read in the scope of the body, and
    // the instance computes it from the very parameters this list decides.
    if (isLoop(node) && node.key !== undefined) spans.push(node.key.expr);
    collectTemplateJs(branch.body, (_kind, span) => spans.push(span));

    const asts: FragmentAst[] = spans.map((span) => this.#ctx.template.ast(span));
    const owned = new Set(own);
    return freeReferences(asts).filter((name) => !owned.has(name) && this.#changeable.has(name));
  }

  // ------------------------------------------------------------------
  // The block function (§3.1, §3.2)
  // ------------------------------------------------------------------

  #build(node: ControlNode, branch: Branch, own: readonly string[]): BuiltBlock {
    return {
      name: `$b${this.#ctx.nextBlock()}`,
      params: [...own, ...this.#dependencies(branch, node, own)],
    };
  }

  /** Write `const $bN = ($parent, $anchor, …) => {…};` into the enclosing closure. */
  #declare(block: BuiltBlock, branch: Branch, node: ControlNode, at: BlockSite): void {
    const bodies = newBodies();
    const inner = new BlockEmitter(this.#ctx, new Set([...this.#changeable, ...block.params]));
    const em = new ClientMarkupEmitter({
      source: this.#ctx.source,
      bodies,
      scope: this.#ctx.scope,
      linker: this.#ctx.linker,
      sink: inner,
      ids: this.#ctx.ids,
      space: at.space,
      trackRoots: true,
    });
    em.emitBlockBody(branch.body, '$c', at.tail);

    const w = at.bodies.decls;
    w.line(`const ${block.name} = (${['$parent', '$anchor', ...block.params].join(', ')}) => {`);
    w.indent();
    if (em.nodes.length > 0) w.line(`let ${em.nodes.join(', ')};`);
    w.line('const $r = [];');
    w.line('const $d = []; // teardowns');
    if (em.writes > 0) w.line('const $w = []; // last applied, per value write');
    w.appendWriter(bodies.decls);
    writeClosure(w, '$a', bodies.apply, 'let $v;');
    writeClosure(w, '$s', bodies.hook);
    // The one place a root of this block reaches the tree, whichever way it got there.
    w.line('const $mv = ($ref, $n) => { if ($ref === null) $dom.append($parent, $n); else $dom.before($ref, $n); return $n; };');
    w.line('return {');
    w.indent();
    w.line(`key: ${this.#keyOf(node)},`);
    w.line('c: () => {');
    w.indent().appendWriter(bodies.fab).line('$a();').dedent();
    w.line('},');
    // `h` never calls `$a()`: the server already painted those values, and rewriting them
    // inside the gesture INP measures is work that changes nothing (§4.5, BUG-12 §4.3).
    w.line('h: ($c) => {');
    w.indent().appendWriter(bodies.adopt).line('return $c;').dedent();
    w.line('},');
    // `m` can be handed the anchor again, because a block whose level is mounted LATER
    // cannot have read it while `c` ran: the variable of the node it inserts before is
    // assigned further down the same walk, and is still `undefined` at that point. The
    // argument is written back into `$anchor` rather than used locally, so a nested block
    // deferred to this very `m` lands in the right place too.
    w.line('m: ($ref = $anchor) => {');
    w.indent()
      .line('$anchor = $ref;')
      .line('for (const $n of $r) $mv($anchor, $n);')
      .appendWriter(bodies.mount)
      .dedent();
    w.line('},');
    w.line('s: $s,');
    w.line(
      block.params.length === 0
        ? `u: () => { $a();${updateCalls(bodies.update)} },`
        : `u: (...$p) => { [${block.params.join(', ')}] = $p; $a();${updateCalls(bodies.update)} },`,
    );
    // Back to front, each root before the one that follows it: what every step needs as a
    // reference is where the piece it just placed BEGINS, which is what `move` returns.
    w.line('move: ($ref) => {');
    w.indent();
    for (const line of moveBody(em.rootItems)) w.line(line);
    w.line('return $ref;');
    w.dedent();
    w.line('},');
    w.line(`r: () => { $d.forEach(($f) => $f()); ${releaseCalls(bodies.registries)}for (const $n of $r) $dom.remove($n); },`);
    w.dedent();
    w.line('};');
    w.dedent();
    w.line('};');
  }

  /** The key expression of a loop, evaluated once per instance: it IS the identity (§3.5). */
  #keyOf(node: ControlNode): string {
    if (!isLoop(node) || node.key === undefined) return 'undefined';
    return this.#slice(node.key.expr);
  }

  // ------------------------------------------------------------------
  // The parent side (§4.3)
  // ------------------------------------------------------------------

  #loop(
    node: LoopNode,
    block: BuiltBlock,
    id: number,
    registry: string,
    parent: string,
    at: BlockSite,
  ): void {
    const head = this.#loopHead(node);
    const args = block.params.join(', ');
    // Always built with a `null` anchor: on the adopt path nothing is inserted, and on the
    // create path the anchor is either irrelevant (the block mounts in its turn) or not yet
    // assigned — which is why the deferred mount hands it over instead.
    const call = `const $i = ${block.name}(${parent}, null${args === '' ? '' : `, ${args}`});`;

    const fab = at.bodies.fab;
    fab.line(`${head} {`).indent();
    fab.line(call);
    fab.line('$i.c();');
    if (!at.deferredMount) fab.line('$i.m();');
    fab.line('$i.s();');
    fab.line(`${registry}.push($i);`);
    fab.dedent().line('}');
    if (at.deferredMount) {
      at.bodies.mount.line(`for (const $i of ${registry}) $i.m(${anchorOf(at)});`);
    }

    const adopt = at.bodies.adopt;
    adopt.line(`${head} {`).indent();
    adopt.line(call);
    adopt.line(this.#adoptStep(at));
    adopt.line('$i.s();');
    adopt.line(`${registry}.push($i);`);
    adopt.dedent().line('}');

    this.#reconcile(node, block, id, registry, parent, at);
  }

  /**
   * `$uN` — the three cases of §4.4, and no heuristic anywhere: the key says whether the row
   * is the same one. A hit is updated in place, a miss is built, and everything the new list
   * did not claim is retired.
   *
   * **Why the index is built by hand and not with `new Map(entries)`.** A duplicate key is
   * not a compile error — it depends on the data — so the behaviour is fixed instead: the
   * FIRST occurrence wins. Built from a list of pairs, a `Map` keeps the last, which is the
   * opposite rule; and, worse, the instance that loses the slot is then reachable from
   * nowhere, so nothing ever calls its `r()`. Its nodes and its disposers would stay behind
   * — the very leak §1 exists to close. The ones that lose the slot go straight to the
   * retire list, where the leftovers of the index join them.
   *
   * The reorder walks BACKWARDS, each block before the one that follows it, so the reference
   * every step needs is the node the previous step just placed. That is why `move` gives
   * back the FIRST node of a block, and why no marker has to exist in the DOM to find it.
   */
  #reconcile(
    node: LoopNode,
    block: BuiltBlock,
    id: number,
    registry: string,
    parent: string,
    at: BlockSite,
  ): void {
    const args = block.params.join(', ');
    const anchor = anchorOf(at);
    const w = at.bodies.decls;
    w.line(`const $u${id} = () => {`);
    w.indent();
    w.line('const $prev = new Map();');
    w.line('const $gone = [];');
    w.line(
      `for (const $i of ${registry}) { if ($prev.has($i.key)) $gone.push($i); else $prev.set($i.key, $i); }`,
    );
    w.line('const $next = [];');
    w.line(`${this.#loopHead(node)} {`);
    w.indent();
    w.line(`const $ky = ${this.#keyOf(node)};`);
    w.line('const $hit = $prev.get($ky);');
    w.line(`if ($hit !== undefined) { $prev.delete($ky); $hit.u(${args}); $next.push($hit); }`);
    w.line(
      `else { const $i = ${block.name}(${parent}, ${anchor}${args === '' ? '' : `, ${args}`}); $i.c(); $i.m(); $i.s(); $next.push($i); }`,
    );
    w.dedent();
    w.line('}');
    w.line('for (const $i of $prev.values()) $gone.push($i);');
    w.line('for (const $i of $gone) $i.r();');
    w.line(
      `for (let $j = $next.length - 1, $ref = ${anchor}; $j >= 0; $j -= 1) $ref = $next[$j].move($ref);`,
    );
    w.line(`${registry} = $next;`);
    w.dedent();
    w.line('};');
  }

  #branching(
    node: ControlNode,
    branches: readonly Branch[],
    blocks: readonly BuiltBlock[],
    id: number,
    registry: string,
    parent: string,
    at: BlockSite,
  ): void {
    const pick = `$q${id}`;
    const make = `$f${id}`;
    const w = at.bodies.decls;
    for (const line of this.#selector(node, branches, pick)) w.line(line);
    const arms = blocks.map(
      (block, i) =>
        `$x === ${i} ? ${block.name}(${parent}, $an${block.params.length === 0 ? '' : `, ${block.params.join(', ')}`})`,
    );
    w.line(`const ${make} = ($x, $an) => ${arms.join(' : ')} : null;`);

    const fab = at.bodies.fab;
    fab.line('{').indent();
    fab.line(`const $q = ${pick}();`);
    fab.line(`const $i = ${make}($q, null);`);
    fab.line(
      `if ($i !== null) { $i.c();${at.deferredMount ? '' : ' $i.m();'} $i.s(); ${registry}.push($i); }`,
    );
    fab.line(`$x${id} = $q;`);
    fab.dedent().line('}');
    if (at.deferredMount) {
      at.bodies.mount.line(`for (const $i of ${registry}) $i.m(${anchorOf(at)});`);
    }

    const adopt = at.bodies.adopt;
    adopt.line('{').indent();
    adopt.line(`const $q = ${pick}();`);
    adopt.line(`const $i = ${make}($q, null);`);
    adopt.line(`if ($i !== null) { ${this.#adoptStep(at)} $i.s(); ${registry}.push($i); }`);
    adopt.line(`$x${id} = $q;`);
    adopt.dedent().line('}');

    // Staying on a branch is an UPDATE of the instance that is alive; changing branch is a
    // teardown and a build. Two arms share neither nodes nor signature (§4.1), so which
    // arguments an update carries is a question of which arm is live — hence `$gN`.
    const feed = blocks.every((b) => b.params.length === 0)
      ? '($x, $i) => $i.u()'
      : `($x, $i) => { ${blocks
          .map((b, i) => `${i === 0 ? 'if' : 'else if'} ($x === ${i}) $i.u(${b.params.join(', ')});`)
          .join(' ')} }`;
    w.line(`const $g${id} = ${feed};`);
    w.line(`const $u${id} = () => {`);
    w.indent();
    w.line(`const $q = ${pick}();`);
    w.line(`if ($q === $x${id}) { for (const $i of ${registry}) $g${id}($q, $i); return; }`);
    w.line(`for (const $i of ${registry}) $i.r();`);
    w.line(`${registry} = [];`);
    w.line(`$x${id} = $q;`);
    w.line(`const $i = ${make}($q, ${anchorOf(at)});`);
    w.line(`if ($i !== null) { $i.c(); $i.m(); $i.s(); ${registry}.push($i); }`);
    w.dedent();
    w.line('};');
  }

  /**
   * Which branch is live now, as a closure the three bodies share. Writing the conditions
   * once is not brevity: `c`, `h` and `u` must agree on the branch, and three copies of an
   * expression are three chances to disagree.
   */
  #selector(node: ControlNode, branches: readonly Branch[], name: string): readonly string[] {
    if (node.type === 'switch') {
      const cases = branches.map((branch, i) =>
        branch.test === undefined
          ? `default: return ${i};`
          : `case ${this.#slice(branch.test)}: return ${i};`,
      );
      return [
        `const ${name} = () => { switch (${this.#slice(node.header.inner)}) { ${cases.join(' ')} } return -1; };`,
      ];
    }
    const elseIndex = branches.findIndex((branch) => branch.kind === 'else');
    let expression = String(elseIndex);
    for (let i = branches.length - 1; i >= 0; i -= 1) {
      const branch = branches[i]!;
      if (branch.test === undefined) continue;
      expression = `${this.#slice(branch.test)} ? ${i} : ${expression}`;
    }
    return [`const ${name} = () => (${expression});`];
  }

  /** `for (…)` / `while (…)` — the author's header, spliced whole (decision 93). */
  #loopHead(node: LoopNode): string {
    const inner = this.#slice(node.header.inner);
    return node.type === 'while' ? `while (${inner})` : `for (${inner})`;
  }

  /**
   * How the adopt path chains the cursor through a block (§4.3): the block takes the
   * level's cursor and gives back the advanced one. A level with no element at all has no
   * cursor variable, so the block is handed `null` — and every read inside it is guarded.
   */
  #adoptStep(at: BlockSite): string {
    const cursor = at.level.cursor;
    return cursor === null ? '$i.h(null);' : `${cursor} = $i.h(${cursor});`;
  }

  #slice(span: Span): string {
    return this.#ctx.source.slice(span.start, span.end);
  }
}

/** The anchor a block inserts before: the next node of its level, or the level's end (§3.4). */
function anchorOf(at: BlockSite): string {
  return at.anchor ?? at.level.end ?? 'null';
}

/** `$dom.remove` reaches this closure's own nodes; a nested block retires its own. */
export function releaseCalls(registries: readonly string[]): string {
  return registries.map((r) => `${r}.forEach(($i) => $i.r()); `).join('');
}

function updateCalls(update: CodeWriter): string {
  return update.empty ? '' : ` ${update.toString().trim().split('\n').join(' ')}`;
}

/** The reverse walk `move` unrolls: every root of the block, last one first. */
function moveBody(items: readonly RootItem[]): readonly string[] {
  const out: string[] = [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i]!;
    out.push(
      item.kind === 'node'
        ? `$ref = $mv($ref, ${item.name});`
        : `for (let $j = ${item.registry}.length - 1; $j >= 0; $j -= 1) $ref = ${item.registry}[$j].move($ref);`,
    );
  }
  return out;
}

/** One private closure of a block. An empty body is `() => {}` and not three lines. */
function writeClosure(w: CodeWriter, name: string, body: CodeWriter, head?: string): void {
  if (body.empty) {
    w.line(`const ${name} = () => {};`);
    return;
  }
  w.line(`const ${name} = () => {`);
  w.indent();
  if (head !== undefined) w.line(head);
  w.appendWriter(body);
  w.dedent();
  w.line('};');
}

/**
 * `const x of xs` vs `x of xs`: only the first DECLARES. The second assigns to a binding
 * that already exists somewhere else, so the loop names nothing of its own — and a loop
 * that names nothing has no key that can tell its rows apart (`FUD0543`).
 *
 * A header Oxc could not parse arrives here as `undefined`, which is the same answer.
 */
function declarationTarget(node: unknown): unknown {
  if (node === null || typeof node !== 'object') return undefined;
  const candidate = node as OxcNode;
  if (candidate.type !== 'VariableDeclaration') return undefined;
  return (candidate['declarations'] as readonly OxcNode[])[0]?.['id'];
}
