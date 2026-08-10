/**
 * Layout and route module emit (SDD-21 §4.5).
 *
 * The composition is by ES MODULE, never by text: a route module imports its layout's
 * module and hands it three slots (`head`, `body`, `section`); a nested layout does the
 * same with its parent. That is what keeps every emitted module anchored to exactly ONE
 * `.fud` — `SourceMapBuilder` has a single `sources` entry (SDD-13 §4.3), so a text-level
 * merge would need multi-source maps that do not exist.
 *
 * Two shapes come out of here:
 *
 *   layout (root)   `export function* layout(data, io, route)` — owns the shell: yields the
 *                   doctype + `<html>` + `<head>` first, then builds ONE body tree with the
 *                   route's nodes spliced in at `@RenderBody()`, then serializes it.
 *   layout (nested) the same signature, but instead of the shell it delegates to its parent,
 *                   composing its own head/body/sections around the route's.
 *
 * A route emits `export function* page(data, io)` — the SAME public shape a standalone page
 * has, so SDD-19's `RenderChunk` wrapper, the manifest and `@fudic/transport` never learn
 * that layouts exist.
 */

import type { HtmlContent } from '../html/index.js';
import type { LayoutDocument, RouteDocument } from '../document/index.js';
import type { SectionNode } from '../layout/index.js';
import { CodeWriter } from './writer.js';
import { MarkupEmitter, renderName, tpl } from './markup.js';
import { AssetLinker } from './assets.js';
import { STYLE_POLYFILL_MIN } from './polyfill.min.js';
import { hydratableTags } from './level.js';
import { writeMapConstants } from './maps.js';
import type { DocumentGraph, ResolvedLayout } from './resolve.js';
import type { EmitOptions, EmitOutput } from './module.js';
import {
  quoteSpecifier,
  slice,
  specifierResolver,
  writeHeadElements,
  writeNonceBinding,
  writeSharedHead,
} from './parts.js';

/** The slots object a layout receives, and the `$dom`/parent names its callbacks use. */
const SLOTS = 'route';
const DOM = '$dom';
const PARENT = '$parent';

/** Default layout specifier: the sibling file, mirroring the component default. */
function layoutSpecifierOf(layout: ResolvedLayout, options: EmitOptions): string {
  const injected = options.layoutSpecifier;
  if (injected !== undefined) return quoteSpecifier(injected(layout));
  const base = layout.path.split(/[\\/]/u).pop() ?? layout.path;
  const stem = base.replace(/\.[^.]+$/u, '');
  return quoteSpecifier(`./${stem}${options.importExt ?? '.mjs'}`);
}

/** The `{ tag, css }` pairs of every component in the graph, deduplicated and ordered. */
function componentPairs(graph: DocumentGraph): readonly string[] {
  return [...graph.components.values()].map(
    (c) => `{ tag: ${renderName(c.tag)}Tag, css: ${renderName(c.tag)}Css }`,
  );
}

/** `import` lines for the component renders a markup emitter used, plus the asset imports. */
function writeImports(
  w: CodeWriter,
  used: ReadonlySet<string>,
  specifier: (tag: string) => string,
  linker: AssetLinker,
): void {
  for (const tag of used) w.line(`import { render as ${renderName(tag)} } from ${specifier(tag)};`);
  for (const line of linker.imports()) w.line(line);
}

// ---------------------------------------------------------------------------
// Layout module
// ---------------------------------------------------------------------------

function buildLayoutModule(
  graph: DocumentGraph,
  layout: ResolvedLayout,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker } {
  const ext = options.importExt ?? '.mjs';
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const doc = layout.doc;
  const source = layout.source;
  const nested = doc.layoutHref !== undefined;

  // Body codegen: the layout's own markup, with `route.body(…)` spliced in where the
  // author wrote `@RenderBody()` (the MarkupEmitter resolves the directive nodes).
  const bodyW = new CodeWriter();
  const em = new MarkupEmitter({
    source,
    w: bodyW,
    isComponent: (t) => graph.components.has(t),
    linker,
    slots: SLOTS,
    hydratable: hydratableTags(graph),
  });
  const bodyParent = nested ? PARENT : '$body';
  em.emitChildren(doc.body.children, bodyParent);

  // Head codegen: the layout's own elements, with the route's contributions injected at
  // `@RenderHead()` — or appended at the end when there is none (FUD0425).
  const headW = new CodeWriter();
  const skip = new Set<HtmlContent>(doc.links);
  if (doc.layoutLink !== undefined) skip.add(doc.layoutLink);
  writeHeadElements(
    source,
    doc.head,
    {
      skip,
      linker,
      ...(doc.renderHead !== undefined ? { injectAt: doc.renderHead as HtmlContent } : {}),
      onInject: () => headW.line(`head += ${SLOTS}.head();`),
    },
    headW,
  );

  const w = new CodeWriter();
  if (nested) {
    // The parent is the next link of the chain (innermost first). When it did not resolve
    // (a broken href already reported by `resolveDocument`), fall back to the author's own
    // specifier: the module still says what it meant to import.
    const parent = layoutParent(graph, layout);
    const spec =
      parent !== undefined ? layoutSpecifierOf(parent, options) : quoteSpecifier(doc.layoutHref ?? '');
    w.line(`import { layout as parentLayout } from ${spec};`);
  }
  writeImports(w, em.used, specifierResolver(graph, options.componentSpecifier, ext), linker);
  w.line('');

  w.line('export function* layout(data, io, route) {');
  w.indent();
  if (nested) {
    w.line('const { escapeText } = io;');
    w.line('yield* parentLayout(data, io, {');
    w.indent();
    w.line('head() {');
    w.indent();
    w.line("let head = '';");
    w.appendWriter(headW);
    w.line('return head;');
    w.dedent();
    w.line('},');
    w.line(`body(${DOM}, ${PARENT}) {`);
    w.indent();
    w.appendWriter(bodyW);
    w.dedent();
    w.line('},');
    // Sections belong to the route; this layout only forwards the ones its parent renders.
    w.line(`section(name, ${DOM}, ${PARENT}) { ${SLOTS}.section(name, ${DOM}, ${PARENT}); },`);
    w.dedent();
    w.line('});');
  } else {
    w.line('const { createDom, serialize, escapeText } = io;');
    w.line("let head = '';");
    w.appendWriter(headW);
    // No whitespace in the skeleton, as in `module.ts` (BUG-07 §4.2).
    w.line(`yield ${JSON.stringify(`<!DOCTYPE html>${slice(source, doc.html.openSpan)}<head>`)} + head + '</head>';`);
    w.line(`const ${DOM} = createDom();`);
    w.line(`const $body = ${DOM}.element('body');`);
    w.appendWriter(bodyW);
    w.line('yield* serialize($body);');
    w.line("yield '</html>';");
  }
  w.dedent();
  w.line('}');
  return { writer: w, linker };
}

/**
 * The parent layout of `layout`: its next link in the chain (innermost first). When the
 * layout is not IN the chain it is the graph's own entry — the plugin emits one module per
 * file, so `resolveDocument('_layout.fud')` returns a graph whose `layouts` are that
 * layout's ancestry — and then its parent is the first link.
 */
function layoutParent(graph: DocumentGraph, layout: ResolvedLayout): ResolvedLayout | undefined {
  const i = graph.layouts.findIndex((l) => l.path === layout.path);
  return i === -1 ? graph.layouts[0] : graph.layouts[i + 1];
}

/** Emit the module of one layout of the graph's chain. */
export function emitLayoutModule(
  graph: DocumentGraph,
  layout: ResolvedLayout,
  options: EmitOptions = {},
): string {
  return buildLayoutModule(graph, layout, options).writer.toString();
}

/** As `emitLayoutModule`, plus the output↔source mappings and missing assets. */
export function emitLayoutModuleMapped(
  graph: DocumentGraph,
  layout: ResolvedLayout,
  options: EmitOptions = {},
): EmitOutput {
  const { writer, linker } = buildLayoutModule(graph, layout, options);
  // No `diagnostics`: a page / layout / route does not go through `extractCode` — its
  // `@code` is the `?server` module, which the plugin parses on its own.
  return {
    code: writer.toString(),
    mappings: writer.mappings(),
    missingAssets: linker.missing(),
    diagnostics: [],
  };
}

// ---------------------------------------------------------------------------
// Route module
// ---------------------------------------------------------------------------

function buildRouteModule(
  graph: DocumentGraph,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker } {
  const ext = options.importExt ?? '.mjs';
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const route = graph.entry as RouteDocument;
  const source = graph.entrySource;
  const comps = [...graph.components.values()];

  const hydratable = hydratableTags(graph);
  const isComponent = (t: string): boolean => graph.components.has(t);
  const bodyW = new CodeWriter();
  const em = new MarkupEmitter({ source, w: bodyW, isComponent, linker, slots: SLOTS, hydratable });
  em.emitChildren(route.markup, PARENT);

  // One `if` arm per declared section; an unknown name renders nothing (decision 85). Its
  // own emitter, because a section builds into the layout's `@RenderSection` point — NOT
  // into the body: sharing the body's emitter would append the section inside the markup.
  const sectionW = new CodeWriter();
  const sectionEm = new MarkupEmitter({
    source,
    w: sectionW,
    isComponent,
    linker,
    slots: SLOTS,
    hydratable,
  });
  for (const section of route.sections as readonly SectionNode[]) {
    if (section.name === '') continue;
    sectionW.line(`if (name === ${JSON.stringify(section.name)}) {`);
    sectionW.indent();
    sectionEm.emitChildren(section.children, PARENT);
    sectionW.dedent();
    sectionW.line('}');
  }

  const headW = new CodeWriter();
  if (route.head !== undefined) {
    writeHeadElements(source, route.head, { skip: new Set<HtmlContent>(), linker }, headW);
  }
  writeSharedHead(headW);

  const w = new CodeWriter();
  const innermost = graph.layouts[0];
  if (innermost !== undefined) {
    w.line(`import { layout } from ${layoutSpecifierOf(innermost, options)};`);
  }
  const specifier = specifierResolver(graph, options.componentSpecifier, ext);
  for (const c of comps) {
    w.line(
      `import { render as ${renderName(c.tag)}, tag as ${renderName(c.tag)}Tag, css as ${renderName(c.tag)}Css } from ${specifier(c.tag)};`,
    );
  }
  for (const line of linker.imports()) w.line(line);
  w.line('');
  w.line(`const COMPONENTS = [${componentPairs(graph).join(', ')}];`);
  // The MINIFIED form: it is inline in every page's head, once per page (BUG-07 §4.3).
  w.line(`const STYLE_POLYFILL = ${tpl(STYLE_POLYFILL_MIN)};`);
  // The maps belong to the ROUTE and not to the layout, and that is not a placement choice:
  // `resolveDocument(route)` reaches the components of the whole chain — the layout's own
  // included — while a layout module is emitted from its own graph and cannot see the
  // route's. One map computed here would be missing half the page.
  writeMapConstants(w, graph, hydratable);
  w.line('');
  // Same public shape as a standalone page: the composition is invisible downstream.
  w.line('export function* page(data, io) {');
  w.indent();
  w.line('const { escapeText } = io;');
  // The nonce belongs to the RESPONSE, so it is read here, where `io` is, and closed over
  // by the head slot the layout calls (SDD-20 §4.9).
  writeNonceBinding(w);
  w.line('yield* layout(data, io, {');
  w.indent();
  w.line('head() {');
  w.indent();
  w.line("let head = '';");
  w.appendWriter(headW);
  w.line('return head;');
  w.dedent();
  w.line('},');
  w.line(`body(${DOM}, ${PARENT}) {`);
  w.indent();
  w.appendWriter(bodyW);
  w.dedent();
  w.line('},');
  w.line(`section(name, ${DOM}, ${PARENT}) {`);
  w.indent();
  w.appendWriter(sectionW);
  w.dedent();
  w.line('},');
  w.dedent();
  w.line('});');
  w.dedent();
  w.line('}');
  return { writer: w, linker };
}

/** Emit the module of a route: `page(data, io)` composed with its layout chain. */
export function emitRouteModule(graph: DocumentGraph, options: EmitOptions = {}): string {
  return buildRouteModule(graph, options).writer.toString();
}

/** As `emitRouteModule`, plus the output↔source mappings and missing assets. */
export function emitRouteModuleMapped(graph: DocumentGraph, options: EmitOptions = {}): EmitOutput {
  const { writer, linker } = buildRouteModule(graph, options);
  // No `diagnostics`: a page / layout / route does not go through `extractCode` — its
  // `@code` is the `?server` module, which the plugin parses on its own.
  return {
    code: writer.toString(),
    mappings: writer.mappings(),
    missingAssets: linker.missing(),
    diagnostics: [],
  };
}
