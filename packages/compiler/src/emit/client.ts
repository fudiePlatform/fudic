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
import { ClientMarkupEmitter } from './markup-client.js';
import { AssetLinker } from './assets.js';
import { extractCode, type Prop } from './oxc-code.js';
import { componentStyleNode, type EmitOptions, type EmitOutput } from './module.js';

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
): { writer: CodeWriter; linker: AssetLinker } {
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const { props, client } = extractCode(comp.source, comp.doc);
  const space = spaceModeOf(comp.tag, componentStyleNode(comp.doc));

  const bodies = { fab: new CodeWriter(), adopt: new CodeWriter(), apply: new CodeWriter() };
  const em = new ClientMarkupEmitter(
    comp.source,
    bodies,
    (t) => graph.components.has(t),
    linker,
    space,
  );
  em.emitRoots(comp.doc.template!.children);

  const w = new CodeWriter();
  w.line("import { FudicElement } from '@fudic/core';");
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
  for (const line of client.body) w.line(line);
  w.line('');
  // Every name from here down starts with `$`, and that is not cosmetic: the `@client`
  // body above was copied VERBATIM into this same scope, so a private closure called `m`
  // is a private closure the author cannot shadow — it is a `SyntaxError` in their face,
  // with no diagnostic (BUG-12 §2.5). The `$` reserve of SDD-15 §4.7 binds the emit too.
  w.line('const $m = () => { for (const $n of $r) $dom.append($shadow, $n); };');
  // `$s` is where listeners and fine-grained subscriptions are registered: the single
  // point create and hydrate converge on. Empty until event bindings land (§4.5, §3.8).
  w.line('const $s = () => {};');
  writeApply(w, bodies.apply);
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
  w.line(
    props.length > 0
      ? `u: ($p) => { ${destructuring(props, 'assign')} $a(); },`
      : 'u: () => { $a(); },',
  );
  w.line(`r: () => { ${[...em.nodes, '$shadow'].join(' = ')} = null; $d.forEach((d) => d()); },`);
  w.dedent();
  w.line('};');
  w.dedent();
  w.line('}');
  w.dedent();
  w.line('});');
  return { writer: w, linker };
}

/**
 * `$a` — the only place a value reaches a node. `c` calls it after fabricating and `u`
 * after reassigning, so create and update converge here and cannot drift apart; that the
 * invariant holds is checkable by looking at the chunk.
 */
function writeApply(w: CodeWriter, apply: CodeWriter): void {
  if (apply.empty) {
    w.line('const $a = () => {};');
    return;
  }
  w.line('const $a = () => {');
  w.indent();
  w.line('let $v;');
  w.appendWriter(apply);
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
  const { writer, linker } = buildComponentClientModule(graph, comp, options);
  return { code: writer.toString(), mappings: writer.mappings(), missingAssets: linker.missing() };
}
