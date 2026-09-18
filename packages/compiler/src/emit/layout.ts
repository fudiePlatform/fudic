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

import type { ElementNode, HtmlContent } from '../html/index.js';
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
import { projectAdoptOf, renderProjectStyles } from './project-styles.js';
import { codeOfDocument, type Prop } from './oxc-code.js';
import { layoutCodeOf, requiredLayoutProps, unresolvedLayoutProps } from './layout-code.js';
import { NO_SIGNALS, writeElementAttrs } from './attrs.js';
import type { Diagnostic } from '../types/index.js';
import {
  quoteSpecifier,
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
/** The layout props of this render, as the module's parameter and as the open tag's sink. */
const PROPS = '$props';
const OPEN = '$open';

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

/**
 * The `<html>` opening tag, through the SAME attribute machinery every other element uses
 * (SDD-40 §4.4).
 *
 * It used to be `slice(source, doc.html.openSpan)` inside a `JSON.stringify`, so whatever the
 * author wrote in its attributes came out literally — `lang="@culture"` reached the browser
 * as the four characters `@cul…`. That was never a streaming restriction: this line lives
 * inside `layout(data, io, route, $ioc, props)`, where `data` and the props are already
 * resolved and not a byte has been emitted. It was a shortcut.
 *
 * `writeElementAttrs` writes `$dom.setAttr(…)`, so the sink is a `$dom` of three lines in a
 * block of its own: the same composition rules (decision 21's omitted falsy attribute, the
 * `class:` composition, the asset linker) and the same escaping the serializer applies, which
 * is what keeps the shell byte-identical to what an element inside the body would produce.
 */
function writeHtmlOpenTag(w: CodeWriter, source: string, html: ElementNode, linker: AssetLinker): void {
  w.line(`let ${OPEN} = '<${html.name}';`);
  w.line('{');
  w.indent();
  w.line(
    `const ${DOM} = { setAttr: ($t, $k, $v) => { ${OPEN} += ' ' + $k + '="' + escapeAttr(String($v)) + '"'; } };`,
  );
  w.line('const $html = null;');
  writeElementAttrs(source, html, '$html', w, linker, NO_SIGNALS);
  w.dedent();
  w.line('}');
  w.line(`${OPEN} += '>';`);
}

/**
 * The layout's own props, destructured at the very top of the module — above its first
 * `yield`, and above every slot that closes over them (§6.5).
 *
 * The same pattern a component writes (`module.ts`), because it is the same declaration: one
 * vocabulary, three roles. A layout with no props writes no line at all.
 */
function writeLayoutProps(w: CodeWriter, props: readonly Prop[]): void {
  if (props.length === 0) return;
  const pattern = props.map((p) => (p.def !== undefined ? `${p.name} = ${p.def}` : p.name)).join(', ');
  w.line(`const { ${pattern} } = ${PROPS} ?? {};`);
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
): { writer: CodeWriter; linker: AssetLinker; diagnostics: readonly Diagnostic[] } {
  const ext = options.importExt ?? '.mjs';
  const linker = new AssetLinker(
    options.linkAssets ?? false,
    options.assetExists,
    options.assetUrl,
  );
  const doc = layout.doc;
  const source = layout.source;
  // What its `@code` declares, and what is wrong with the rest of it (SDD-40 §3.1, §4.1).
  const code = layoutCodeOf(source, doc);

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
    projectAdopt: projectAdoptOf(options.projectStyles, options.styleChains),
  });
  em.emitChildren(doc.body.children, '$body');

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
  writeImports(w, em.used, specifierResolver(graph, options.componentSpecifier, ext), linker);
  w.line('');

  // The fourth parameter is the route's container, handed over untouched: a layout owns no
  // container of its own, it only passes the one the route opened to the component hosts its
  // own markup renders (SDD-38 §4.7).
  // The fifth parameter is the layout's own props (SDD-40 §3.4), and it comes AFTER `$ioc`
  // for the only reason that matters downstream: the container already held the fourth
  // place, and a parameter that changes position changes every caller.
  w.line(`export function* layout(data, io, route, $ioc, ${PROPS}) {`);
  w.indent();
  w.line('const { createDom, serialize, escapeText, escapeAttr } = io;');
  writeLayoutProps(w, code.props);
  w.line("let head = '';");
  w.appendWriter(headW);
  // The shell's opening tag, interpolated like any other element (§4.4). No whitespace in
  // the skeleton, as in `module.ts` (BUG-07 §4.2).
  writeHtmlOpenTag(w, source, doc.html, linker);
  w.line(`yield '<!DOCTYPE html>' + ${OPEN} + '<head>' + head + '</head>';`);
  w.line(`const ${DOM} = createDom();`);
  w.line(`const $body = ${DOM}.element('body');`);
  // The `<body>`'s own attributes, which until now were dropped whole — the element was
  // built from its tag name and nothing else. The same omission as the `<html>` above and
  // the same fix, and §3.1's own example needs it: `<body data-theme="@theme">`.
  writeElementAttrs(source, doc.body, '$body', w, linker, NO_SIGNALS);
  w.appendWriter(bodyW);
  // The last thing in the body: the route hangs its three JSON blocks here (SDD-15
  // §3.3–§3.5), and the layout is the one file that can say «the body is finished».
  w.line(`${SLOTS}.blocks(${DOM}, $body);`);
  w.line('yield* serialize($body);');
  w.line("yield '</html>';");
  w.dedent();
  w.line('}');
  return { writer: w, linker, diagnostics: code.diagnostics };
}

/** Emit the module of the graph's layout. */
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
  const { writer, linker, diagnostics } = buildLayoutModule(graph, layout, options);
  // Its `@code` DOES reach a reader now (SDD-40): it declares the layout's props, and what
  // else it holds is `FUD0700`. Its markup is still static (SDD-39 §7), so there is no
  // client half to split and nothing else comes out of the extraction.
  return {
    code: writer.toString(),
    mappings: writer.mappings(),
    missingAssets: linker.missing(),
    diagnostics,
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
  const linker = new AssetLinker(
    options.linkAssets ?? false,
    options.assetExists,
    options.assetUrl,
  );
  const route = graph.entry as RouteDocument;
  const source = graph.entrySource;
  const comps = [...graph.components.values()];
  // The route's own `@code`, which until SDD-39 reached nowhere: its `@server` region is
  // still the `?server` module and nothing else, but the neutral zone runs on BOTH sides and
  // the names `@client` declares have to EXIST here, or a `@count()` in the markup is a
  // `ReferenceError` that takes the whole prerender with it (§1.1).
  const code = codeOfDocument(source, route);
  // The project's guide (SDD-42), built before anything flushes the linker's imports —
  // compacting a sheet can register one, and a binding imported after the flush is a
  // module that does not parse.
  const projectStylesLine = renderProjectStyles(options.projectStyles, linker);
  const projectAdopt = projectAdoptOf(options.projectStyles, options.styleChains);

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
    projectAdopt,
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
    projectAdopt,
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
  writeSharedHead(headW, styled.size > 0, projectStylesLine !== null);


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
  if (projectStylesLine !== null) w.line(projectStylesLine);
  // The MINIFIED form: it is inline in every page's head, once per page (BUG-07 §4.3).
  if (styled.size > 0 || projectStylesLine !== null) {
    w.line(`const STYLE_POLYFILL = ${tpl(STYLE_POLYFILL_MIN)};`);
  }
  // The maps belong to the ROUTE and not to the layout, and that is not a placement choice:
  // `resolveDocument(route)` reaches the components of the whole chain — the layout's own
  // included — while a layout module is emitted from its own graph and cannot see the
  // route's. One map computed here would be missing half the page.
  // What the page says about its own client half (SDD-39 §4.2, §4.7). `FUD0621` comes out of
  // the same read: a `data` the client reads and no `load` ever filled is knowable here.
  const routeDiagnostics: Diagnostic[] = [];
  // The layout contract (SDD-40 §4.7): a prop the chain REQUIRES and this route does not
  // resolve, over the `<link rel="layout">` that declares the relation. The emit is where it
  // belongs and not the semantic pass, for the same reason the emit owns the chain at all —
  // only a caller that resolved the graph sees both files at once. The BUILD reports it; the
  // editor hears the same fact from TypeScript over the projection, and one fact has one voice.
  //
  // No resolver at all is «the route resolves nothing», which is the very case the diagnostic
  // is for; a resolver whose return this pass cannot read is «not provable», and that reports
  // nothing. The extraction already tells the two apart.
  const resolver = code.layoutResolver;
  const readable = resolver === undefined ? [] : resolver.keys;
  if (readable !== undefined) {
    routeDiagnostics.push(
      ...unresolvedLayoutProps(requiredLayoutProps(graph.layouts), readable, route.layoutLink.openSpan),
    );
  }
  const blocks = routeBlocksOf(graph, options.routeName, routeDiagnostics);
  // The maps carry the route too — its entry in `fud-tree`, and its name in `fud-eager` when
  // it comes up without a gesture — under the name it publishes, never under a tag.
  const maps = writeMapConstants(w, graph, hydratable, blocks?.name);
  // The route's answer to the layout's `fudic:runtime` marker (BUG-31 §T1).
  const runtimeW = new CodeWriter();
  writeRuntimeTags(runtimeW, needsRuntime(hydratable, hasDi, blocks !== undefined));
  w.line('');
  // Same public shape as a standalone page: the composition is invisible downstream.
  // The fourth parameter is what `export function layout(ctx, data)` resolved: the union of
  // what the whole chain declares (§4.8). The route only carries it — it never reads it, and
  // it never goes inside `data`, because what a route paints and what its layout needs are
  // two shapes and mixing them makes the second an accident of the first (§3.3).
  w.line(`export function* page(data, io, $ioc, ${PROPS}) {`);
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
  w.line(`}, ${ioc}, ${PROPS});`);
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
