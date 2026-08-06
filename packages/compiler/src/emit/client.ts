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
import type { Diagnostic } from '../types/index.js';

/**
 * The positional destructuring of `$props` (§4.2) — the exact mirror of the `Object.values`
 * the server does. `$props` is always `[$dom, $shadow, ...values]`, and the compiler knows
 * the order of the props from the AST, so the payload carries no schema: only values.
 *
 * `let`, not `const`: `r()` releases `$shadow` on teardown.
 */
function destructuring(props: readonly Prop[]): string {
  const names = props.map((p) => (p.def !== undefined ? `${p.name} = ${p.def}` : p.name));
  return `let [$dom, $shadow${names.map((n) => `, ${n}`).join('')}] = $props;`;
}

function buildComponentClientModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker; diagnostics: readonly Diagnostic[] } {
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const { props, client, diagnostics } = extractCode(comp.source, comp.doc);
  const space = spaceModeOf(comp.tag, componentStyleNode(comp.doc));

  const fab = new CodeWriter();
  const adopt = new CodeWriter();
  const em = new ClientMarkupEmitter(
    comp.source,
    fab,
    adopt,
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
  w.line('const $r = [];'); // the roots, mounted by m()
  w.line('const $d = []; // teardowns');
  w.line(destructuring(props));
  for (const line of client.body) w.line(line);
  w.line('');
  w.line('const m = () => { for (const $n of $r) $dom.append($shadow, $n); };');
  // `s` is where listeners and fine-grained subscriptions will be registered: the single
  // point create and hydrate converge on. Empty until event bindings land (§4.5, §3.8).
  w.line('const s = () => {};');
  w.line('');
  w.line('return {');
  w.indent();
  w.line('c: () => {'); // fabricate → mount → hook up
  w.indent();
  w.appendWriter(fab);
  w.line('m();');
  w.line('s();');
  w.dedent();
  w.line('},');
  w.line('h: () => {'); // adopt → hook up; no m(), the structure came mounted
  w.indent();
  w.appendWriter(adopt);
  w.line('s();');
  w.dedent();
  w.line('},');
  w.line(`r: () => { ${[...em.nodes, '$shadow'].join(' = ')} = null; $d.forEach((d) => d()); },`);
  w.dedent();
  w.line('};');
  w.dedent();
  w.line('}');
  w.dedent();
  w.line('});');
  return { writer: w, linker, diagnostics };
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
