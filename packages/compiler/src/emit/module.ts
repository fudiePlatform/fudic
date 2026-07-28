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
import type { PageDocument, ComponentDocument } from '../document/index.js';
import { CodeWriter, type EmitMapping } from './writer.js';
import { MarkupEmitter, renderName, tpl } from './markup.js';
import { AssetLinker, type AssetExists } from './assets.js';
import { extractCode } from './oxc-code.js';
import { STYLE_POLYFILL } from './polyfill.js';
import {
  type ComponentSpecifier,
  type LayoutSpecifier,
  specifierResolver,
  writeHeadElements,
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
}

/** The `<head>` `<style>` CSS of a component (the shared sheet body). */
function componentCss(source: string, doc: ComponentDocument): string {
  const style = doc.head?.children.find(
    (c): c is ElementNode => c.type === 'element' && c.name === 'style',
  );
  if (!style) return '';
  return source.slice(style.openSpan.end, style.closeSpan ? style.closeSpan.start : style.span.end);
}

function buildComponentModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker } {
  const ext = options.importExt ?? '.mjs';
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const { props, signals } = extractCode(comp.source, comp.doc);
  const bodyW = new CodeWriter();
  const em = new MarkupEmitter(comp.source, bodyW, (t) => graph.components.has(t), linker);
  for (const child of comp.doc.template!.children) em.emit(child, '$shadow');
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
    w.line(`const ${s.name} = { value: (${s.init}) }; // inert signal (SSR; hydration is client-side)`);
  }
  w.appendWriter(bodyW); // carries the markup's source anchors, unlike a toString()/split copy
  w.dedent();
  w.line('}');
  return { writer: w, linker };
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
  const { writer, linker } = buildComponentModule(graph, comp, options);
  return { code: writer.toString(), mappings: writer.mappings(), missingAssets: linker.missing() };
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
  for (const child of page.body.children) em.emit(child, '$body');

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
  w.line(`const STYLE_POLYFILL = ${tpl(STYLE_POLYFILL)};`);
  w.line('');
  // Streaming a trozos (SDD-19 §4.3): a generator that yields the <head> FIRST, then the
  // body by pieces via `serialize` (serializeChunks), then the close. `io.serialize` is a
  // generator; joining the pieces is byte-identical to the previous whole-string return.
  w.line('export function* page(data, io) {');
  w.indent();
  w.line('const { createDom, serialize, escapeText } = io;');
  // The CSP nonce of THIS response (SDD-20 §4.9): the polyfill is an inline script, so
  // without it a strict `script-src 'self'` kills it and no shadow root adopts a sheet.
  // Absent (a plain `renderToString`), the output is byte-identical to before.
  w.line("const $nonce = io.nonce ? ' nonce=\"' + io.nonce + '\"' : '';");
  w.line("let head = '';");
  w.appendWriter(headW);
  w.line('// The style-adoption polyfill (SDD-18 §5) goes in <head>, live BEFORE the body streams,');
  w.line('// so its observer adopts each host sheet as it arrives; the style modules follow it.');
  w.line("head += '  <script' + $nonce + '>' + STYLE_POLYFILL + '</script>\\n';");
  w.line("head += COMPONENTS.map(function (c) { return '  <style type=\"module\" specifier=\"' + c.tag + '\">' + c.css + '</style>'; }).join('\\n') + '\\n';");
  w.line('yield \'<!DOCTYPE html>\\n<html lang="es">\\n<head>\\n\' + head + \'</head>\\n\';');
  w.line('const $dom = createDom();');
  w.line('const $body = $dom.element(\'body\');');
  w.appendWriter(bodyW);
  w.line('yield* serialize($body);');
  w.line("yield '\\n</html>\\n';");
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
  return { code: writer.toString(), mappings: writer.mappings(), missingAssets: linker.missing() };
}
