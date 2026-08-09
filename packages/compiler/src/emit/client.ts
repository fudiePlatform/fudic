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
 * (`data-id`, `fud-chunks`), and a chunk nobody asks for costs nothing.
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
import { extractCode, type ExtractedCode, type Prop } from './oxc-code.js';
import { hookupContext } from './events.js';
import { componentStyleNode, type EmitOptions, type EmitOutput } from './module.js';
import type { Diagnostic } from '../types/index.js';

/**
 * `@code` of a component, memoized on the resolved component itself.
 *
 * A parent now needs its CHILD's prop order to compose the positional array `u` takes
 * (BUG-12 §3.4), so the same file would otherwise be handed to Oxc once per parent that
 * holds it, plus once for its own chunk. The graph resolves each component to a single
 * object, so a `WeakMap` keyed by it keeps the invariant the compiler is built on: Oxc is
 * invoked exactly once per file.
 */
const codeCache = new WeakMap<ResolvedComponent, ExtractedCode>();

function codeOf(comp: ResolvedComponent): ExtractedCode {
  const cached = codeCache.get(comp);
  if (cached !== undefined) return cached;
  const code = extractCode(comp.source, comp.doc);
  codeCache.set(comp, code);
  return code;
}

/**
 * The positional destructuring of `$props` (§4.2) — the exact mirror of the `Object.values`
 * the server does. `$props` is always `[$dom, $shadow, ...values]`, and the compiler knows
 * the order of the props from the AST, so the payload carries no schema: only values.
 *
 * Two forms over the SAME list, because a prop crosses more than once (BUG-12 §3.3):
 *
 * - `declare` — the intake. `let`, not `const`: `r()` releases `$shadow` on teardown, and
 *   `u` reassigns the props.
 * - `assign` — the update. The two leading holes stay EMPTY: `$dom` and `$shadow` are the
 *   adapter and the root, and an update carries state, not plumbing. The defaults are
 *   repeated because an update may perfectly well bring `undefined` back.
 */
function destructuring(props: readonly Prop[], form: 'declare' | 'assign'): string {
  const names = props.map((p) => (p.def !== undefined ? `${p.name} = ${p.def}` : p.name));
  if (form === 'declare') return `let [$dom, $shadow${names.map((n) => `, ${n}`).join('')}] = $props;`;
  return `[, , ${names.join(', ')}] = $p;`;
}

function buildComponentClientModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker; diagnostics: readonly Diagnostic[] } {
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const { props, signals, client, template, mutable, emitCalls, diagnostics } = codeOf(comp);
  const space = spaceModeOf(comp.tag, componentStyleNode(comp.doc));

  const bodies = newBodies();
  const scope = {
    childProps: (tag: string): readonly Prop[] | undefined => {
      const child = graph.components.get(tag);
      return child === undefined ? undefined : codeOf(child).props;
    },
    signals: new Set(signals.map((s) => s.name)),
  };
  // What a block may be handed: the props (an update reassigns every one of them) and the
  // `@client` bindings the author can move. Everything else reaches it through the closure.
  const changeable = new Set([...props.map((p) => p.name), ...mutable]);
  // One channel for everything the emit has to SAY about this file, and one for what every
  // walk of it shares: a block three levels down reports through the same two.
  const emitDiagnostics: Diagnostic[] = [];
  const hookup = hookupContext(template, emitDiagnostics);
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
    space,
  });
  em.emitRoots(comp.doc.template!.children);

  const w = new CodeWriter();
  // Written after the walk on purpose: `$sub` is imported only if the walk found a value
  // to keep in sync, so a component with no reactive prop carries no dead import (§6.20).
  const core = usage.subscribes ? 'FudicElement, subscribe as $sub' : 'FudicElement';
  w.line(`import { ${core} } from '@fudic/core';`);
  for (const line of client.imports) w.line(line); // hoisted: only legal at module scope
  for (const line of linker.imports()) w.line(line);
  w.line('');
  w.line(`customElements.define(${JSON.stringify(comp.tag)}, class extends FudicElement {`);
  w.indent();
  w.line('static c($props) {');
  w.indent();
  if (em.nodes.length > 0) w.line(`let ${em.nodes.join(', ')};`);
  w.line('const $r = [];'); // the roots, mounted by $m()
  w.line('const $d = []; // teardowns');
  if (em.writes > 0) w.line('const $w = []; // last applied, per value write');
  w.line(destructuring(props, 'declare'));
  // The host, materialized ONLY where something reads it (§4.4). A component with no bus
  // subscription and no `emit` does not pay a line of chunk for a reference nobody looks
  // at, and the chunk budget that keeps INP flat on a cache miss is what pays for that.
  // `let`, not `const`: `r()` releases it along with the nodes and the shadow root.
  const needsHost = emitCalls.length > 0 || hookup.hostUsed;
  if (needsHost) w.line('let $host = $dom.host($shadow);');
  for (const line of client.body) w.line(line);
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
  // `$s` is where hookup is registered: the single point create and hydrate converge on.
  // It carries the values a child receives and their subscriptions (BUG-12 §3.4); host
  // listeners and the component's own fine-grained subscriptions are still to come
  // (§4.5, §3.8).
  writeClosure(w, '$s', bodies.hook);
  // `$a` — the only place a value reaches a node. `c` calls it after fabricating and `u`
  // after reassigning, so create and update converge here and cannot drift apart; that the
  // invariant holds is checkable by looking at the chunk.
  writeClosure(w, '$a', bodies.apply, 'let $v;');
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
  // The update channel: reassign the positional bindings and re-apply. No node is created,
  // nothing is mounted and nothing is subscribed again — `u` is of VALUE (BUG-12 §4.2).
  const reconcile = bodies.update.empty ? '' : ` ${lines(bodies.update)}`;
  w.line(
    props.length > 0
      ? `u: ($p) => { ${destructuring(props, 'assign')} $a();${reconcile} },`
      : `u: () => { $a();${reconcile} },`,
  );
  w.line(
    `r: () => { ${releaseCalls(bodies.registries)}${[...em.nodes, '$shadow', ...(needsHost ? ['$host'] : [])].join(' = ')} = null; $d.forEach((d) => d()); },`,
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
