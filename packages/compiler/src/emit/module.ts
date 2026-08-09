/**
 * Module emit (SDD-15 server branch): turn the AST + the resolved dependency graph
 * (SDD-10 links, see resolve.ts) into ES modules — ONE `.mjs` per component and one for
 * the page. Text only; the compiler imports no runtime. This file only ORCHESTRATES:
 * the markup codegen lives in `markup.ts`, the `@code` extraction in `oxc-code.ts`, and
 * the inline style-adoption polyfill in `polyfill.ts`.
 *
 * Component module: `export const tag`, `export const css`, and
 * `export function render($dom, $shadow, props)` that builds the shadow subtree via the
 * injected `Dom<N>` adapter. Composition is real ES imports between modules
 * (`app-card.mjs` imports `app-button.mjs`). Signals are emitted INERT in SSR — an
 * un-hydrated `signal` contributes only its initial value.
 *
 * Page module (`home.mjs`): imports the component modules, hoists every component's
 * `<head>` into the page `<head>` (each `<style>` as `<style type="module" specifier>`),
 * composes the body, and emits the inline, blocking style-adoption `<script>` (SDD-18 §5)
 * in `<head>` BEFORE the body streams, so the page shows with styles applied.
 * `page(data, io)` returns the whole HTML string; `io` injects the SSR adapter.
 */

import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import type { ElementNode, HtmlContent } from '../html/index.js';
import type { StyleNode } from '../css/index.js';
import type { PageDocument, ComponentDocument } from '../document/index.js';
import type { Diagnostic } from '../types/index.js';
import { spaceModeOf } from './space.js';
import { CodeWriter, type EmitMapping } from './writer.js';
import { MarkupEmitter, renderName, tpl } from './markup.js';
import { AssetLinker, type AssetExists } from './assets.js';
import { compactStyleCss } from './css-compact.js';
import { extractCode } from './oxc-code.js';
import { STYLE_POLYFILL_MIN } from './polyfill.min.js';
import {
  type ComponentSpecifier,
  type LayoutSpecifier,
  specifierResolver,
  writeHeadElements,
  writeNonceBinding,
  writeSharedHead,
} from './parts.js';

/**
 * Emit options. `importExt` is the extension used for sibling module imports: `.mjs`
 * for the standalone emit (build.ts / goldens), `.fud` for the Vite plugin so Vite
 * owns the module-graph resolution (SDD-19 §4.11.1).
 */
export interface EmitOptions {
  readonly importExt?: string;
  /**
   * Rewrite static, relative asset URLs (`src`/`poster`/`<link href>`, CSS `url(…)`) to
   * ES imports Vite resolves and hashes (SDD-19 §4.5). Off by default so the standalone
   * `.mjs` emit stays runnable under Node (which cannot import a `.png`).
   */
  readonly linkAssets?: boolean;
  /**
   * Existence check for a linkable asset specifier (relative to the module). A linked
   * asset that fails it is left as a literal and surfaced in `EmitOutput.missingAssets`
   * so the plugin can report FUD0363 without aborting the build (§6.13).
   */
  readonly assetExists?: AssetExists;
  /**
   * Module specifier for a linked component, INJECTED — the compiler never touches
   * `node:path`, so it cannot compute a path relative to the importing module. Default:
   * `./<tag><importExt>`, the sibling-file convention of the standalone `.mjs` emit. The
   * Vite plugin supplies the real relative specifier, so a component may live anywhere
   * (`components/app-card.fud` linked from `routes/blog/index.fud`).
   */
  readonly componentSpecifier?: ComponentSpecifier;
  /**
   * Module specifier under which a route imports its layout, and a nested layout its parent
   * (SDD-21 §3.4). INJECTED for the same reason as `componentSpecifier`. Default:
   * `./<file base name><importExt>`, the sibling-file convention.
   */
  readonly layoutSpecifier?: LayoutSpecifier;
}

export type { ComponentSpecifier, LayoutSpecifier };

/**
 * A module's emitted text plus its output↔source mappings (SDD-19 §4.6) and the linkable
 * asset specifiers that did not resolve (§6.13). The plain `emit*Module` functions return
 * `.code`; the `*Mapped` variants add the rest.
 */
export interface EmitOutput {
  readonly code: string;
  readonly mappings: readonly EmitMapping[];
  readonly missingAssets: readonly string[];
  /**
   * Syntax diagnostics from the `@code` the module was built out of (BUG-13 §5.3). The
   * emit does not stop for them — the text is already written, degraded — but it must not
   * hide them either: a `@code` that does not parse used to reach the prerender as a
   * `ReferenceError` in a file that never mentioned the cause.
   */
  readonly diagnostics: readonly Diagnostic[];
}

/** The component's single `<style>` element, if it wrote one (decision 62). */
function styleElement(doc: ComponentDocument): ElementNode | undefined {
  return doc.head?.children.find(
    (c): c is ElementNode => c.type === 'element' && c.name === 'style',
  );
}

/**
 * The `<head>` `<style>` CSS of a component (the shared sheet body), COMPACTED.
 *
 * It is built from the `StyleNode` and not from a `source.slice(...)` of the file: the
 * body was already parsed, and walking it is what lets the whitespace go while every
 * interpolation stays byte for byte (BUG-08 §3.1). A slice of the source in the emit is a
 * sign that a node is going unused.
 */
function componentCss(source: string, doc: ComponentDocument): string {
  const style = componentStyleNode(doc);
  if (!style) return '';
  return compactStyleCss(source, style);
}

/**
 * The PARSED body of that `<style>` — a `<style>` carries a `StyleNode` child, because
 * the parser runs `parseStyle` over its body for the Razor (SDD-09). It is what tells the
 * whitespace model whether this component declared a preserving `white-space` (BUG-07
 * §4.4), which is precisely the fact an external HTML minifier cannot know.
 */
export function componentStyleNode(doc: ComponentDocument): StyleNode | null {
  const child = styleElement(doc)?.children[0];
  return child !== undefined && child.type === 'style-content' ? child : null;
}

function buildComponentModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker; diagnostics: readonly Diagnostic[] } {
  const ext = options.importExt ?? '.mjs';
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const { props, signals, diagnostics } = extractCode(comp.source, comp.doc);
  const bodyW = new CodeWriter();
  const space = spaceModeOf(comp.tag, componentStyleNode(comp.doc));
  const em = new MarkupEmitter(
    comp.source,
    bodyW,
    (t) => graph.components.has(t),
    linker,
    undefined,
    space,
    new Set(signals.map((s) => s.name)),
  );
  em.emitChildren(comp.doc.template!.children, '$shadow');
  // css uses the linker too (may register more imports), so build it before the imports.
  const css = linker.cssTemplate(componentCss(comp.source, comp.doc));

  const w = new CodeWriter();
  const specifier = specifierResolver(graph, options.componentSpecifier, ext);
  for (const tag of em.used) w.line(`import { render as ${renderName(tag)} } from ${specifier(tag)};`);
  for (const line of linker.imports()) w.line(line);
  if (em.used.size > 0 || linker.imports().length > 0) w.line('');
  w.line(`export const tag = ${JSON.stringify(comp.tag)};`);
  w.line(`export const css = ${css};`);
  w.line('');
  w.line('export function render($dom, $shadow, props) {');
  w.indent();
  if (props.length > 0) {
    const pattern = props.map((p) => (p.def !== undefined ? `${p.name} = ${p.def}` : p.name)).join(', ');
    w.line(`const { ${pattern} } = props ?? {};`);
  }
  for (const s of signals) {
    // Inert signal: SSR contributes the initial value and nothing else. A FUNCTION, because
    // that is the shape the client has — since SDD-31 §4.0 the call form is the only way to
    // read a signal, so a template that says `expanded()` has to mean the same thing on both
    // branches. The object with a `peek` this used to be was not callable, and the day the
    // author wrote the call form it compiled on the client and threw in the prerender.
    w.line(`const ${s.name} = () => (${s.init}); // inert signal (SSR; hydration is client-side)`);
  }
  w.appendWriter(bodyW); // carries the markup's source anchors, unlike a toString()/split copy
  w.dedent();
  w.line('}');
  return { writer: w, linker, diagnostics };
}

export function emitComponentModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions = {},
): string {
  return buildComponentModule(graph, comp, options).writer.toString();
}

/** As `emitComponentModule`, plus the output↔source mappings and missing assets (§4.6/§6.13). */
export function emitComponentModuleMapped(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions = {},
): EmitOutput {
  const { writer, linker, diagnostics } = buildComponentModule(graph, comp, options);
  return {
    code: writer.toString(),
    mappings: writer.mappings(),
    missingAssets: linker.missing(),
    diagnostics,
  };
}

function buildPageModule(graph: ComponentGraph, options: EmitOptions): { writer: CodeWriter; linker: AssetLinker } {
  const ext = options.importExt ?? '.mjs';
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const page = graph.entry as PageDocument;
  const source = graph.entrySource;
  const comps = [...graph.components.values()];

  // Body codegen.
  const bodyW = new CodeWriter();
  const em = new MarkupEmitter(source, bodyW, (t) => graph.components.has(t), linker);
  em.emitChildren(page.body.children, '$body');

  // Head codegen (page's own head elements + hoisted style modules at runtime). `<title>`
  // is the one interpolated element (`@data.title`); every other element the author wrote
  // — `meta`, `link`, `script`, `base`, `style` — passes through VERBATIM, so a page keeps
  // its favicon, its stylesheet and its `<script src>`. The `<link rel="component">`
  // elements are the component graph, not output, and are skipped.
  const componentLinks = new Set<HtmlContent>(page.links);
  const headW = new CodeWriter();
  writeHeadElements(source, page.head, { skip: componentLinks, linker }, headW);

  const w = new CodeWriter();
  const specifier = specifierResolver(graph, options.componentSpecifier, ext);
  for (const c of comps) {
    w.line(
      `import { render as ${renderName(c.tag)}, tag as ${renderName(c.tag)}Tag, css as ${renderName(c.tag)}Css } from ${specifier(c.tag)};`,
    );
  }
  for (const line of linker.imports()) w.line(line); // asset imports Vite resolves (SDD-19 §4.5)
  w.line('');
  w.line(`const COMPONENTS = [${comps.map((c) => `{ tag: ${renderName(c.tag)}Tag, css: ${renderName(c.tag)}Css }`).join(', ')}];`);
  // The MINIFIED form: it is inline in every page's head, once per page (BUG-07 §4.3).
  w.line(`const STYLE_POLYFILL = ${tpl(STYLE_POLYFILL_MIN)};`);
  w.line('');
  // Streaming a trozos (SDD-19 §4.3): a generator that yields the <head> FIRST, then the
  // body by pieces via `serialize` (serializeChunks), then the close. `io.serialize` is a
  // generator; joining the pieces is byte-identical to the previous whole-string return.
  w.line('export function* page(data, io) {');
  w.indent();
  w.line('const { createDom, serialize, escapeText } = io;');
  writeNonceBinding(w);
  w.line("let head = '';");
  w.appendWriter(headW);
  writeSharedHead(w);
  // No whitespace in the skeleton (BUG-07 §4.2). Between the doctype, `<html>`, `<head>`
  // and its elements there is no context where a newline or an indent renders: the HTML
  // parser drops it before the tree is built. It is the free half of this BUG.
  w.line('yield \'<!DOCTYPE html><html lang="es"><head>\' + head + \'</head>\';');
  w.line('const $dom = createDom();');
  w.line('const $body = $dom.element(\'body\');');
  w.appendWriter(bodyW);
  w.line('yield* serialize($body);');
  w.line("yield '</html>';");
  w.dedent();
  w.line('}');
  return { writer: w, linker };
}

export function emitPageModule(graph: ComponentGraph, options: EmitOptions = {}): string {
  return buildPageModule(graph, options).writer.toString();
}

/** As `emitPageModule`, plus the output↔source mappings and missing assets (§4.6/§6.13). */
export function emitPageModuleMapped(graph: ComponentGraph, options: EmitOptions = {}): EmitOutput {
  const { writer, linker } = buildPageModule(graph, options);
  // No `diagnostics`: a page / layout / route does not go through `extractCode` — its
  // `@code` is the `?server` module, which the plugin parses on its own.
  return {
    code: writer.toString(),
    mappings: writer.mappings(),
    missingAssets: linker.missing(),
    diagnostics: [],
  };
}
