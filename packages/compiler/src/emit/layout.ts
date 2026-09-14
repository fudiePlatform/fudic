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
import { formAssociatedTags, hydratableTags } from './level.js';
import { hasDependencyInjection } from './di.js';
import { needsRuntime, routeBlocksOf, writeMapConstants, writeHydrationBlocks } from './maps.js';
import type { DocumentGraph, ResolvedLayout } from './resolve.js';
import { styledTags, type EmitOptions, type EmitOutput } from './module.js';
import { codeOfDocument } from './oxc-code.js';
import type { Diagnostic } from '../types/index.js';
import {
  quoteSpecifier,
  slice,
  specifierResolver,
  writeEntryCode,
  writeEntryImports,
  writeHeadElements,
  writeNonceBinding,
  writeRuntimeTags,
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
function componentPairs(graph: DocumentGraph, styled: ReadonlySet<string>): readonly string[] {
  return [...graph.components.values()]
    .filter((c) => styled.has(c.tag))
    .map((c) => `{ tag: ${renderName(c.tag)}Tag, css: ${renderName(c.tag)}Css }`);
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
    formAssociated: formAssociatedTags(graph),
    styled: styledTags(graph),
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
      // The marker resolves to a fact of the ROUTE — whether THIS page hydrates — and a
      // layout is shared by many routes, so it asks, exactly as it does for the head
      // contributions (BUG-31 §T1).
      onRuntime: () => headW.line(`head += ${SLOTS}.runtime();`),
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

  // The fourth parameter is the route's container, forwarded down the chain untouched: a
  // layout owns no container of its own, it only hands the one the route opened to the
  // component hosts its own markup renders (SDD-38 §4.7).
  w.line('export function* layout(data, io, route, $ioc) {');
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
    // Same for the hydration blocks: they are the ROUTE's — it is the one whose graph reaches
    // the whole chain — and only the outermost layout knows when the body is finished.
    w.line(`blocks(${DOM}, ${PARENT}) { ${SLOTS}.blocks(${DOM}, ${PARENT}); },`);
    w.dedent();
    w.line('}, $ioc);');
  } else {
    w.line('const { createDom, serialize, escapeText } = io;');
    w.line("let head = '';");
    w.appendWriter(headW);
    // No whitespace in the skeleton, as in `module.ts` (BUG-07 §4.2).
    w.line(`yield ${JSON.stringify(`<!DOCTYPE html>${slice(source, doc.html.openSpan)}<head>`)} + head + '</head>';`);
    w.line(`const ${DOM} = createDom();`);
    w.line(`const $body = ${DOM}.element('body');`);
    w.appendWriter(bodyW);
    // The last thing in the body, and the outermost layout is the only one that can say
    // «the body is finished»: the route hangs its three JSON blocks here (SDD-15 §3.3–§3.5).
    w.line(`${SLOTS}.blocks(${DOM}, $body);`);
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
  // No `diagnostics`: a LAYOUT does not go through `extractCode` — its markup is static in
  // this version (SDD-39 §7), so its `@code` is the `?server` module and nothing else, and
  // the plugin parses that one on its own.
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
): { writer: CodeWriter; linker: AssetLinker; diagnostics: readonly Diagnostic[] } {
  const ext = options.importExt ?? '.mjs';
  const linker = new AssetLinker(options.linkAssets ?? false, options.assetExists);
  const route = graph.entry as RouteDocument;
  const source = graph.entrySource;
  const comps = [...graph.components.values()];
  // The route's own `@code`, which until SDD-39 reached nowhere: its `@server` region is
  // still the `?server` module and nothing else, but the neutral zone runs on BOTH sides and
  // the names `@client` declares have to EXIST here, or a `@count()` in the markup is a
  // `ReferenceError` that takes the whole prerender with it (§1.1).
  const code = codeOfDocument(source, route);

  const hydratable = hydratableTags(graph);
  const formAssociated = formAssociatedTags(graph);
  // The styled half of the graph (BUG-31 §T4): what wears an adopt marker, what reaches
  // `COMPONENTS`, and — when it is empty — whether the polyfill is emitted at all.
  const styled = styledTags(graph);
  const isComponent = (t: string): boolean => graph.components.has(t);
  // Whether ANY component the route reaches injects or provides. A route without a single
  // DI call opens no container tree, imports nothing and publishes no map (SDD-38 §5).
  const hasDi = hasDependencyInjection(graph);
  const ioc = hasDi ? '$root' : '$ioc';
  const bodyW = new CodeWriter();
  const em = new MarkupEmitter({
    source,
    w: bodyW,
    isComponent,
    linker,
    slots: SLOTS,
    hydratable,
    ioc,
    formAssociated,
    styled,
  });
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
    ioc,
    formAssociated,
    styled,
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
  writeSharedHead(headW, styled.size > 0);


  const w = new CodeWriter();
  const innermost = graph.layouts[0];
  if (innermost !== undefined) {
    w.line(`import { layout } from ${layoutSpecifierOf(innermost, options)};`);
  }
  const specifier = specifierResolver(graph, options.componentSpecifier, ext);
  // `tag`/`css` only for the styled ones (BUG-31 §T4); `render` for every component, since
  // the graph renders them all whether or not they have a sheet.
  for (const c of comps) {
    const style = styled.has(c.tag)
      ? `, tag as ${renderName(c.tag)}Tag, css as ${renderName(c.tag)}Css`
      : '';
    w.line(`import { render as ${renderName(c.tag)}${style} } from ${specifier(c.tag)};`);
  }
  for (const line of linker.imports()) w.line(line);
  // The neutral zone's own imports, hoisted — an `import` is only legal at module scope
  // (decision 33.c). A route imports its form, its store or its data helper exactly as a
  // component does, and both ends of the file need the binding.
  writeEntryImports(w, code);
  w.line('');
  w.line(`const COMPONENTS = [${componentPairs(graph, styled).join(', ')}];`);
  // The MINIFIED form: it is inline in every page's head, once per page (BUG-07 §4.3).
  if (styled.size > 0) w.line(`const STYLE_POLYFILL = ${tpl(STYLE_POLYFILL_MIN)};`);
  // The maps belong to the ROUTE and not to the layout, and that is not a placement choice:
  // `resolveDocument(route)` reaches the components of the whole chain — the layout's own
  // included — while a layout module is emitted from its own graph and cannot see the
  // route's. One map computed here would be missing half the page.
  const maps = writeMapConstants(w, graph, hydratable);
  // What the page says about its own client half (SDD-39 §4.2, §4.7). `FUD0621` comes out of
  // the same read: a `data` the client reads and no `load` ever filled is knowable here.
  const routeDiagnostics: Diagnostic[] = [];
  const blocks = routeBlocksOf(graph, options.routeName, routeDiagnostics);
  // The route's answer to the layout's `fudic:runtime` marker (BUG-31 §T1).
  const runtimeW = new CodeWriter();
  writeRuntimeTags(runtimeW, needsRuntime(hydratable, hasDi));
  w.line('');
  // Same public shape as a standalone page: the composition is invisible downstream.
  w.line('export function* page(data, io, $ioc) {');
  w.indent();
  w.line(`const { escapeText, jsonBlock${hasDi ? ', iocRoot, publishedSeed' : ''} } = io;`);
  if (hasDi) w.line('const $root = $ioc ?? iocRoot();');
  // The nonce belongs to the RESPONSE, so it is read here, where `io` is, and closed over
  // by the head slot the layout calls (SDD-20 §4.9).
  writeNonceBinding(w);
  // And the author's own `@code`, BEFORE the slots that read it: every one of them — the
  // head, the body, each section — is a closure over this scope, and the layout calls them
  // from inside `layout(...)`, so a name declared here is in scope for all of them.
  writeEntryCode(w, code);
  w.line('yield* layout(data, io, {');
  w.indent();
  w.line('head() {');
  w.indent();
  w.line("let head = '';");
  w.appendWriter(headW);
  w.line('return head;');
  w.dedent();
  w.line('},');
  // What the layout's `fudic:runtime` marker becomes for THIS route (BUG-31 §T1). The
  // layout says where the runtime goes; only the route knows whether there is anything to
  // hydrate, because its graph is the one that reaches the whole chain.
  w.line('runtime() {');
  w.indent();
  w.line("let head = '';");
  w.appendWriter(runtimeW);
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
  // The blocks are the route's because its graph is the one that reaches the whole chain —
  // the layout's own components included — and they are emitted from a slot because only the
  // outermost layout knows where the body ends.
  w.line(`blocks(${DOM}, ${PARENT}) {`);
  w.indent();
  writeHydrationBlocks(w, maps, DOM, PARENT, hasDi ? '$root' : undefined, blocks);
  w.dedent();
  w.line('},');
  w.dedent();
  w.line(`}, ${ioc});`);
  w.dedent();
  w.line('}');
  return { writer: w, linker, diagnostics: [...code.diagnostics, ...routeDiagnostics] };
}

/** Emit the module of a route: `page(data, io)` composed with its layout chain. */
export function emitRouteModule(graph: DocumentGraph, options: EmitOptions = {}): string {
  return buildRouteModule(graph, options).writer.toString();
}

/** As `emitRouteModule`, plus the output↔source mappings and missing assets. */
export function emitRouteModuleMapped(graph: DocumentGraph, options: EmitOptions = {}): EmitOutput {
  const { writer, linker, diagnostics } = buildRouteModule(graph, options);
  return {
    code: writer.toString(),
    mappings: writer.mappings(),
    missingAssets: linker.missing(),
    diagnostics,
  };
}
