/**
 * Client module emit (SDD-15 §3.7, §4.2, §4.6): one ES module per component, carrying its
 * `static c($props)` factory and the `customElements.define`, and NOTHING else. The
 * instance scaffolding — `h(props)`, `c(props)`, `disconnectedCallback`, the controller
 * field — lives in `FudicElement` (`@fudic/core`), inherited: emitting it would repeat the
 * same bytes in every chunk, and the chunk budget that keeps INP flat on a cache miss is
 * what pays for that.
 *
 * **Every component gets one, with no level filter.** A component has no level of its own:
 * one that is N1 in isolation becomes N3 the moment an ancestor hands it a reactive prop,
 * and a component's `.fud` cannot see the page it is used in. Deciding here would mean
 * inferring the effective level before the page exists. Who hydrates is page knowledge
 * (`data-fud-id`, `fud-tree`), and a chunk nobody asks for costs nothing.
 *
 * The `@code { @client }` body is copied VERBATIM (§4.7), TypeScript included: this module
 * is bundler input, and stripping types is the bundler's job.
 */

import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import { spaceModeOf } from './space.js';
import { CodeWriter } from './writer.js';
import { ClientMarkupEmitter, coreUsage, nodeIds } from './markup-client.js';
import { BlockEmitter, blockContext, newBodies, releaseCalls } from './block.js';
import { AssetLinker } from './assets.js';
import { codeOf, splicedOffset, type ClientStatement, type Prop } from './oxc-code.js';
import { hookupContext } from './events.js';
import { planControls } from './controls.js';
import { isFormAssociated } from '../binding/index.js';
import { movingNames } from './level.js';
import { rootContext } from './display.js';
import { cellSlots, childTargets, reactiveScope, type CellSlot } from './state.js';
import {
  componentBoxes,
  componentContainer,
  componentStyleNode,
  type EmitOptions,
  type EmitOutput,
} from './module.js';
import type { Diagnostic } from '../types/index.js';

/**
 * The positional destructuring of `$props` (§4.2) — the exact mirror of the `Object.values`
 * the server does. `$props` is always `[$dom, $shadow, ...values]`, and the compiler knows
 * the order of the props from the AST, so the payload carries no schema: only values.
 *
 * The INTAKE, and only the intake: `let`, not `const`, because `r()` releases `$shadow` on
 * teardown and `u` reassigns the props. Handing over is delivering the whole state, so a
 * pattern — which assigns everything it names — is exactly the right shape here.
 */
function declaration(props: readonly Prop[], cells: readonly CellSlot[]): string {
  const names = props.map((p) => (p.def !== undefined ? `${p.name} = ${p.def}` : p.name));
  // The cells come out under their POSITIONAL names and not under the author's, because the
  // author's is about to be declared by their own `const count = …` a few lines down. What
  // arrives here is the slot; `$pK ?? signal(init)` is where the two meet (BUG-24 §4.4).
  const slots = cells.map((c) => cellName(c));
  return `let [$dom, $shadow${[...names, ...slots].map((n) => `, ${n}`).join('')}] = $props;`;
}

/**
 * The name a cell arrives under: its index in `$props`, which is its slot plus the two
 * leading slots `$dom` and `$shadow` occupy.
 *
 * Inside the `$` reserve of SDD-15 §4.7, so it cannot collide with anything the author wrote
 * — the `@client` body is copied verbatim into this same scope.
 */
const cellName = (cell: CellSlot): string => `$p${cell.slot + 2}`;

/**
 * The UPDATE, over the same list and in the same order — but not with the same shape
 * (BUG-18 §3.1). A destructuring pattern assigns everything it names, and that is what
 * forced the parent to recompose the child's whole tuple on every notification: a hole and
 * a present `undefined` are indistinguishable to a pattern, so a partial array would send
 * the props the parent did not name back to their defaults (BUG-12 §3.4, whose reasoning
 * was correct FOR THAT SHAPE).
 *
 * One guard per prop, asking for PRESENCE, tells the two apart:
 *
 *     if (2 in $p) label = $p[2];
 *     if (3 in $p) variant = $p[3] === undefined ? 'default' : $p[3];
 *
 * An absent hole leaves the prop as it stands; a present `undefined` applies the default,
 * which is the rule of BUG-12 §3.3 — an update may perfectly well bring `undefined` back —
 * carried over intact. The offset is `+2` because the two leading slots are `$dom` and
 * `$shadow`: an update carries state, not plumbing.
 */
/**
 * `if (2 in $p) $cb();` — the update that re-makes the control bindings, and only it.
 *
 * PRESENCE and not equality, exactly like `updateGuards`: the payload is sparse, so what the
 * parent named is what moved. A parent that sends the same node again rebinds to the same
 * node, which is a teardown and a hookup that change nothing — and a parent that sends a
 * different one is precisely the case this exists for.
 */
function rebindGuard(props: readonly Prop[], rebound: ReadonlySet<string>): string {
  const slots = props.flatMap((p, i) => (rebound.has(p.name) ? [i + 2] : []));
  return `if (${slots.map((s) => `${s} in $p`).join(' || ')}) $cb();`;
}

function updateGuards(props: readonly Prop[]): string {
  return props
    .map((p, i) => {
      const cell = `$p[${i + 2}]`;
      const value = p.def !== undefined ? `${cell} === undefined ? ${p.def} : ${cell}` : cell;
      return `if (${i + 2} in $p) ${p.name} = ${value};`;
    })
    .join(' ');
}

/**
 * One statement of `@client`, with the cell spliced in front of every reactive it declares
 * that a child asked for by reference (BUG-24 §4.4):
 *
 *     const n = signal(start);        →     const n = $p3 ?? signal(start);
 *
 * **One expression, not two branches**, and that is the answer to the objection SDD-31 §7
 * raised against a lazy upgrade. `$p3` comes filled by `h` — an instance the server rendered,
 * whose slice carries the cell the runtime materialised — and empty by `c`, an instance the
 * parent fabricated at runtime, which has no payload at all; there the author's own
 * initialiser runs, exactly as it always did. There is no second mode a chunk can be in, and
 * therefore no window in which the first update could arrive in the other one's shape.
 *
 * By OFFSET and never by text: the region is copied verbatim, so a `signal` inside a string
 * or a comment is not a declaration. The offsets are the author's, and `splicedOffset` carries
 * them across whatever `extractCode` already inserted into this same statement.
 */
function withCells(
  statement: ClientStatement,
  signals: readonly { readonly name: string; readonly at: number }[],
  cells: readonly CellSlot[],
): string {
  const named = new Map(cells.map((c) => [c.name, c]));
  const edits: { at: number; text: string }[] = [];
  for (const reactive of signals) {
    const cell = named.get(reactive.name);
    if (cell === undefined) continue;
    const at = splicedOffset(statement, reactive.at);
    if (at < 0 || at > statement.text.length) continue; // declared in another statement
    edits.push({ at, text: `${cellName(cell)} ?? ` });
  }
  edits.sort((a, b) => b.at - a.at);
  return edits.reduce((out, e) => out.slice(0, e.at) + e.text + out.slice(e.at), statement.text);
}

function buildComponentClientModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker; diagnostics: readonly Diagnostic[] } {
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const { props, signals, client, neutral, template, mutable, emitCalls, diagnostics } = codeOf(comp);
  const space = spaceModeOf(comp.tag, componentStyleNode(comp.doc));
  // The same three facts the server branch starts from, read from the same graph and the
  // same `<style>`: what the two branches drop has to be the same set, node for node (§4.5).
  const at = rootContext(space, componentContainer(comp), componentBoxes(graph, comp));
  // The cells this component publishes: what a child asked to be handed by reference, in the
  // slots `state.ts` lays out. It is the same list the server serialises with — one source
  // for both, or the payload stops lining up (BUG-24 §4.2).
  const cells = cellSlots(comp, graph);

  const bodies = newBodies();
  // What a block may be handed: the props (an update reassigns every one of them) and the
  // `@client` bindings the author can move. Everything else reaches it through the closure.
  const changeable = new Set([...props.map((p) => p.name), ...mutable]);
  const scope = {
    childProps: (tag: string): readonly Prop[] | undefined => {
      const child = graph.components.get(tag);
      return child === undefined ? undefined : codeOf(child).props;
    },
    declared: childTargets(graph),
    // A prop that arrived by reference is a reactive name like any other (BUG-24 §4.5): it
    // reads `value()`, it crosses on to a grandchild as the object, and it repaints this
    // component. No new rule anywhere — one more name in the set every existing rule reads.
    signals: reactiveScope(comp),
    // The same set `level.ts` decides hydratability with, and from the same function: what
    // the emit hands over again and what the page marks hydratable cannot disagree.
    moving: movingNames(comp),
  };
  // One channel for everything the emit has to SAY about this file, and one for what every
  // walk of it shares: a block three levels down reports through the same two.
  const emitDiagnostics: Diagnostic[] = [];
  const hookup = hookupContext(
    template,
    emitDiagnostics,
    new Set(props.flatMap((p) => (p.channel === 'fn' ? [p.name] : []))),
    // The same plan the server branch built, from the same function: the two branches write
    // the same nodes with the same ids, or `h` adopts a tree it does not recognise (SDD-34).
    planControls(comp.source, comp.doc.template!.children, (t) => graph.components.has(t)),
    // What tells a `control` whose node CROSSED from the parent (decision 110) from one this
    // component already holds. The two are hooked up at different moments, and only the first
    // has to be able to happen again.
    new Set(props.map((p) => p.name)),
  );
  const ids = nodeIds();
  const usage = coreUsage();
  const ctx = blockContext(comp.source, scope, linker, ids, usage, hookup);
  const em = new ClientMarkupEmitter({
    source: comp.source,
    bodies,
    scope,
    linker,
    sink: new BlockEmitter(ctx, changeable),
    ids,
    usage,
    hookup,
    at,
    // The factory's own walk, and the only one that can defer a crossed `control` to `$cb`:
    // `$cb`, `u` and the top-level node variables all live in this closure.
    rebindable: true,
  });
  // A callback has no initialiser to fall back on, so its cell cannot be `??`-ed into the
  // author's declaration: the owner FILLS it as it hooks up (§4.6, step 3), and first, before
  // any child of this instance is handed anything. `?.` and not a guard: an instance the
  // parent created at runtime has no cell, and there the function crosses directly — which is
  // the same single path seen from the other side.
  for (const cell of cells) {
    if (cell.kind === 'fn') bodies.hook.line(`${cellName(cell)}?.set(${cell.name});`);
  }
  em.emitRoots(comp.doc.template!.children);

  // The component's OWN reactivity, and the only consumer a signal has: the emitted code
  // (SDD-31 §1). `$a()` re-applies the value writes and the constructs reconcile after it,
  // but until now nothing ever called them again — `u` is the parent's channel, so a
  // component whose template reads a signal it declares itself painted once and went deaf.
  //
  // Every declared `signal` is subscribed, not the subset the template appears to read: a
  // read can travel through a helper of `@client`, and a name-by-name scan of the write
  // sites would miss exactly that and miss it SILENTLY. Over-subscribing costs a pass of
  // `$a` that writes nothing — `$w` filters per write (BUG-12 §3.3) — and missing one costs
  // a view that does not move. A `computed` is NOT subscribed: it has no value of its own,
  // and the leaves underneath it are already in this list.
  //
  // A prop that arrived by reference is in this list too, and that is §4.5 in one line: the
  // child subscribes to it exactly as to a signal of its own, so it repaints on ITS OWN
  // writes and on the owner's alike — and the parent no longer forwards anything to it.
  const reactive = [
    ...signals.flatMap((s) => (s.kind === 'signal' ? [s.name] : [])),
    ...props.flatMap((p) => (p.channel === 'signal' ? [p.name] : [])),
  ];
  // Nothing to renew: a component with signals but no value write and no construct has no
  // rendering that a `set` could change.
  // A `control` whose node crossed as a prop is bound from `$cb` and not from `$s`, because
  // the node is not there yet when `$s` runs: the cascade hooks a child up in post-order,
  // BEFORE the parent's own hookup composes its payload, so the value the child was given at
  // that moment is empty and stays empty until `u` brings it (SDD-34 §4.6, BUG-12 §4.2).
  // `$cb` is therefore called from both ends — once on hookup, and again whenever one of the
  // props it reads moves — and it undoes what it made before, so calling it twice binds once.
  const rebinds = !hookup.rebind.empty;
  if (rebinds) bodies.hook.line('$cb();');
  const renews = reactive.length > 0 && (em.writes > 0 || !bodies.update.empty);
  const reconcile = bodies.update.empty ? '' : ` ${lines(bodies.update)}`;
  if (renews) {
    usage.subscribes = true;
    // Into `$s`, which is where create and hydrate converge — and `$sub` does NOT deliver on
    // subscribe (SDD-31 §4.8), so `h` stays as paint-free as it is today: no text node is
    // rewritten inside the gesture INP measures just for hooking up.
    for (const name of reactive) bodies.hook.line(`$d.push($sub(${name}, $u));`);
  }

  const w = new CodeWriter();
  // Written after the walk on purpose: `$sub` is imported only if the walk found a value
  // to keep in sync, so a component with no reactive prop carries no dead import (§6.20).
  // A control-component extends `FudicControlElement` instead (decision 109), which brings
  // `static formAssociated = true`, the `ElementInternals` its constructor creates, and a
  // shadow root that delegates focus. `FudicElement` is still imported for nothing it uses,
  // so it is not: the base is one name or the other, never both.
  const formAssociated = isFormAssociated(comp.doc.template!);
  const base = formAssociated ? 'FudicControlElement' : 'FudicElement';
  const core = usage.subscribes
    ? `${formAssociated ? '' : 'FudicElement, '}subscribe as $sub`
    : 'FudicElement';
  if (!formAssociated || usage.subscribes) w.line(`import { ${core} } from '@fudic/core';`);
  if (formAssociated) w.line("import { FudicControlElement } from '@fudic/forms/element';");
  // The bind functions this walk actually called, and no others. It is §6.7 made structural:
  // the chunk of a component with one text field names `bindText` and does not mention the
  // other five — not their names, not their modules. Sorted so the line is stable.
  if (hookup.binds.size > 0) {
    w.line(`import { ${[...hookup.binds].sort().join(', ')} } from '@fudic/forms/dom';`);
  }
  // The neutral zone's imports first, then `@client`'s — both hoisted, because an `import`
  // is only legal at module scope (decision 33.c). Verbatim, TypeScript included: this
  // module is bundler input and stripping types is the bundler's job.
  for (const statement of neutral) {
    if (statement.hoisted) w.line(statement.text);
  }
  for (const line of client.imports) w.line(line); // hoisted: only legal at module scope
  for (const line of linker.imports()) w.line(line);
  w.line('');
  w.line(`customElements.define(${JSON.stringify(comp.tag)}, class extends ${base} {`);
  w.indent();
  w.line('static c($props) {');
  w.indent();
  if (em.nodes.length > 0) w.line(`let ${em.nodes.join(', ')};`);
  w.line('const $r = [];'); // the roots, mounted by $m()
  w.line('const $d = []; // teardowns');
  // Its own list, because it is the only one that is emptied while the instance lives.
  if (rebinds) w.line('const $cd = []; // the control bindings, remade when the node moves');
  if (em.writes > 0) w.line('const $w = []; // last applied, per value write');
  w.line(declaration(props, cells));
  // The host, materialized ONLY where something reads it (§4.4). A component with no bus
  // subscription and no `emit` does not pay a line of chunk for a reference nobody looks
  // at, and the chunk budget that keeps INP flat on a cache miss is what pays for that.
  // `let`, not `const`: `r()` releases it along with the nodes and the shadow root.
  const needsHost = emitCalls.length > 0 || hookup.hostUsed;
  if (needsHost) w.line('let $host = $dom.host($shadow);');
  // The neutral zone runs on BOTH sides, so it runs here too — before `@client`, which is
  // the order it was written in and the order the server evaluates it in. No cell splicing:
  // a cell is a `@client` top-level binding by construction (`cellSlots` reads
  // `clientNames`), so nothing declared here can be one.
  for (const statement of neutral) {
    if (!statement.hoisted) w.line(statement.text);
  }
  for (const statement of client.body) w.line(withCells(statement, signals, cells));
  w.line('');
  // The blocks: one function per construct, plus the registry of what is alive (SDD-30
  // §3.1, §3.6). Declared HERE, so each one reads `$dom`, the props and the `@client` body
  // above through lexical scope instead of through its signature.
  w.appendWriter(bodies.decls);
  // Every name from here down starts with `$`, and that is not cosmetic: the `@client`
  // body above was copied VERBATIM into this same scope, so a private closure called `m`
  // is a private closure the author cannot shadow — it is a `SyntaxError` in their face,
  // with no diagnostic (BUG-12 §2.5). The `$` reserve of SDD-15 §4.7 binds the emit too.
  writeMount(w, bodies.mount);
  // `$cb` — the bindings of every `control` whose node crossed as a prop, made again from
  // scratch. It undoes its own previous work first, so the second call replaces the first
  // instead of doubling it: what changes between them is which node the element is bound to.
  if (rebinds) {
    w.line('const $cb = () => {');
    w.indent();
    w.line('for (const $x of $cd) $x();');
    w.line('$cd.length = 0;');
    w.appendWriter(hookup.rebind);
    w.dedent();
    w.line('};');
  }
  // `$s` is where hookup is registered: the single point create and hydrate converge on.
  // It carries the values a child receives and their subscriptions (BUG-12 §3.4); host
  // listeners and the component's own fine-grained subscriptions are still to come
  // (§4.5, §3.8).
  writeClosure(w, '$s', bodies.hook);
  // `$a` — the only place a value reaches a node. `c` calls it after fabricating and `u`
  // after reassigning, so create and update converge here and cannot drift apart; that the
  // invariant holds is checkable by looking at the chunk.
  writeClosure(w, '$a', bodies.apply, 'let $v;');
  // `$u` — one rendering pass: the values, then the reconciliation of every construct. It
  // is extracted only when something subscribes to it, because it is the SAME body `u` runs
  // and a component with no signal of its own would pay a closure to say so.
  if (renews) w.line(`const $u = () => { $a();${reconcile} };`);
  w.line('');
  w.line('return {');
  w.indent();
  w.line('c: () => {'); // fabricate → write the values → mount → hook up
  w.indent();
  w.appendWriter(bodies.fab);
  w.line('$a();');
  w.line('$m();');
  w.line('$s();');
  w.dedent();
  w.line('},');
  // Adopt → hook up. No `$m()`: the structure came mounted. And no `$a()` either — the
  // server already painted those values, so re-applying them would rewrite every text node
  // of the subtree with the string it already holds, inside the gesture that INP measures,
  // to change nothing. `h` adopts positions; the payload stays the authority on state.
  w.line('h: () => {');
  w.indent();
  w.appendWriter(bodies.adopt);
  w.line('$s();');
  w.dedent();
  w.line('},');
  // The update channel: reassign the positional bindings the payload CARRIES and re-apply.
  // No node is created, nothing is mounted and nothing is subscribed again — `u` is of
  // VALUE (BUG-12 §4.2). The payload may be sparse: handing over is delivering the whole
  // state, updating is saying what moved (BUG-18 §4.1).
  //
  // `$a()` is called ONCE, after every guard and not one per prop: with two props moving in
  // the same call there is no intermediate state anyone can observe.
  //
  // The pass itself is `$u` when the component subscribes to its own signals: one body, so
  // a value that moves by prop and a value that moves by signal cannot be applied
  // differently.
  const pass = renews ? '$u();' : `$a();${reconcile}`;
  // And, after the pass, the bindings of a crossed node — but only when THAT prop is the one
  // that moved. A rebind tears listeners down and puts them back, so doing it on every
  // update would charge every prop of the component for a node that did not change.
  const rebound = rebinds ? ` ${rebindGuard(props, hookup.rebound)}` : '';
  w.line(
    props.length > 0
      ? `u: ($p) => { ${updateGuards(props)} ${pass}${rebound} },`
      : `u: () => { ${pass} },`,
  );
  w.line(
    `r: () => { ${releaseCalls(bodies.registries)}${[...em.nodes, '$shadow', ...(needsHost ? ['$host'] : [])].join(' = ')} = null;${rebinds ? ' $cd.forEach((d) => d());' : ''} $d.forEach((d) => d()); },`,
  );
  w.dedent();
  w.line('};');
  w.dedent();
  w.line('}');
  w.dedent();
  w.line('});');
  // The emit's own diagnostics travel with `@code`'s: a loop whose header declares nothing
  // (FUD0543) or a binding that cannot be subscribed (FUD0291) is as much a fact about this
  // file as a `@code` that does not parse, and the emit does not stop for any of them (§5).
  return { writer: w, linker, diagnostics: [...diagnostics, ...emitDiagnostics] };
}

/**
 * `$m` — the roots into the shadow root.
 *
 * A block at the root level is mounted HERE and not while `c` fabricates, and its anchor is
 * a sibling root that this loop has already put in place: inserting during `c` would land
 * the block's rows ahead of every root still waiting in `$r` (SDD-30 §3.4).
 */
function writeMount(w: CodeWriter, mount: CodeWriter): void {
  if (mount.empty) {
    w.line('const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };');
    return;
  }
  w.line('const $m = () => {');
  w.indent();
  w.line('for (const $n of $r) $dom.append($shadow, $n);');
  w.appendWriter(mount);
  w.dedent();
  w.line('};');
}

/** A writer's body as one line: `u` and `r` are single-line closures. */
function lines(body: CodeWriter): string {
  return body
    .toString()
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ');
}

/**
 * One private closure of the factory. An empty body is written as `() => {}` and not as a
 * block: a component that hooks up nothing, or has no value to apply, should not pay three
 * lines of chunk to say so.
 */
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

/** The client chunk of one component: `static c($props)` plus its `define`. */
export function emitComponentClientModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions = {},
): string {
  return buildComponentClientModule(graph, comp, options).writer.toString();
}

/** As `emitComponentClientModule`, plus the output↔source mappings and missing assets. */
export function emitComponentClientModuleMapped(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions = {},
): EmitOutput {
  const { writer, linker, diagnostics } = buildComponentClientModule(graph, comp, options);
  return {
    code: writer.toString(),
    mappings: writer.mappings(),
    missingAssets: linker.missing(),
    diagnostics,
  };
}
