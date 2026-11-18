/**
 * Module emit (SDD-15 server branch): turn the AST + the resolved dependency graph
 * (SDD-10 links, see resolve.ts) into ES modules — ONE `.mjs` per component (a route and its layout are
 * emitted by `layout.ts`). Text only; the compiler imports no runtime. This file only ORCHESTRATES:
 * the markup codegen lives in `markup.ts`, the `@code` extraction in `oxc-code.ts`, and
 * the inline style-adoption polyfill in `polyfill.ts`.
 *
 * Component module: `export const tag`, `export const css`, and
 * `export function render($dom, $shadow, props)` that builds the shadow subtree via the
 * injected `Dom<N>` adapter. Composition is real ES imports between modules
 * (`app-card.mjs` imports `app-button.mjs`). Signals are emitted INERT in SSR — an
 * un-hydrated `signal` contributes only its initial value.
 */

import {
  allComponents,
  entryComponent,
  type ComponentGraph,
  type ResolvedComponent,
} from './resolve.js';
import type { ElementNode } from '../html/index.js';
import type { FlatSheet, StyleNode } from '../css/index.js';
import type { ComponentDocument } from '../document/index.js';
import type { Diagnostic } from '../types/index.js';
import type { CspNeed } from '@fudic/config';
import { spaceModeOf } from './space.js';
import { hasForeignDisplay, hostDisplay, type Boxes, type Display } from './display.js';
import { CodeWriter, type EmitMapping } from './writer.js';
import { MarkupEmitter, renderName } from './markup.js';
import { stampOption, type SourceLocator } from './source-locations.js';
import {
  AssetLinker,
  type AssetExists,
  type AssetSheet,
  type AssetText,
  type AssetUrl,
} from './assets.js';
import { rebaseSpec, type EarlyHint, type PageSheets, type SheetUse } from './page-sheets.js';
import { compactStyleCss } from './css-compact.js';
import type { LocaleCompile } from '../i18n/localize.js';
import { codeOf, diHelpers } from './oxc-code.js';
import { propDefaults, restGroups } from './rest.js';
import { cellSlots, childTargets, reactiveScope } from './state.js';
import { bridgeIds, formAssociatedTags, hydratableTags, shadowOptions } from './level.js';
import { planControls } from './controls.js';
import { apiFields, apiImports } from './api-links.js';
import {
  type ComponentSpecifier,
  type LayoutSpecifier,
  specifierResolver,
  writeInert,
} from './parts.js';
import {
  compactProjectCss,
  projectAdoptOf,
  projectCss,
  type ProjectStyle,
} from './project-styles.js';

/**
 * Emit options. `importExt` is the extension used for sibling module imports: `.mjs`
 * for the standalone emit (build.ts / goldens), `.fud` for the Vite plugin so Vite
 * owns the module-graph resolution (SDD-19 §4.11.1).
 */
export interface EmitOptions {
  readonly importExt?: string;
  /**
   * The project's own stylesheets, in adoption order (SDD-42 §3.2).
   *
   * They are hoisted ONCE per document and their specifiers are prepended to the adopted
   * list of every component this project defines. Absent — the standalone emit, a golden,
   * a project with no `styles` — and the output is byte for byte what it was before
   * SDD-42, which is the invariant that SDD's net is built on.
   */
  readonly projectStyles?: readonly ProjectStyle[];
  /**
   * Which of those sheets each component adopts, keyed by tag (SDD-43 §4.6).
   *
   * A document can compose components from several packages, and a component adopts the
   * guides of the chain of the package that DEFINES it — the consumer's own sheet does not
   * reach a library's component, which is what stops an app restyling a library by accident.
   * Only the host can answer it: the chain is a fact of `package.json` files on a disk.
   *
   * Absent and every component adopts every sheet of `projectStyles`, which is SDD-42 as it
   * was and what keeps a single-project build unchanged.
   */
  readonly styleChains?: ReadonlyMap<string, readonly string[]>;
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
   * The published URL of a linked asset, INJECTED — and when it is given, what the emit
   * writes is that URL and not an import.
   *
   * It is the host's answer because only the host can give one: a URL has to be the same in
   * every pass of a build that compiles this file three times, and it has to be a URL and
   * not whatever the bundler decides the extension means. Absent, the emit falls back to an
   * import, which is what the standalone `.mjs` emit has always done.
   */
  readonly assetUrl?: AssetUrl;
  /**
   * The bytes of an asset the author asked to embed (`…?inline`, SDD-45 §3.6), INJECTED for
   * the same reason as the two above: reading a file is the host's, never the compiler's.
   *
   * Absent — a standalone emit, a golden — and nothing is embedded: the reference stays the
   * URL the author wrote, which is a page that still works.
   */
  readonly assetText?: AssetText;
  /**
   * Prune the page's sheets (SDD-49 §4): every sheet a page receives — the ones its layout
   * and its own `<head>` link, and the project's — keeps only the rules that can apply to
   * some element of the scope it reaches. Absent, and every sheet arrives whole, as before.
   */
  readonly pruneStyles?: boolean;
  /**
   * The URL of the pruned copy of a linked sheet, INJECTED for the reason `assetUrl` is: the
   * host names it by its content and publishes it (SDD-49 §3.5). Absent, and a pruned sheet
   * the page links keeps the URL of the whole file.
   */
  readonly assetSheet?: AssetSheet;
  /**
   * The URL of a sheet published as a file, named `name` and holding `css`, INJECTED: the host
   * names it by its content and publishes it (SDD-73 §3.5). With it, a page's CSS leaves the
   * page — each `<style>` of a head and each `?inline` sheet becomes a `<link>`, and every
   * component wears `<link>`s at the end of its shadow root instead of adopting style modules.
   * Absent, and the emit is what it always was, byte for byte.
   */
  readonly componentSheet?: (name: string, css: string) => string;
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
  /**
   * The route's chunk name — `safeName(pattern)` (SDD-39 §4.7). INJECTED for the same reason
   * the two specifiers are: the compiler holds one file and has never heard of a URL pattern,
   * while the plugin has the route table in hand.
   *
   * Its absence is what a build with no routing looks like — the standalone `.mjs` emit, a
   * golden — and then a route publishes no `fud-route` block and claims no id: there is no
   * chunk for it to name, so an id on the `<body>` would be an attribute nobody reads.
   */
  readonly routeName?: string;
  /**
   * The locale this module is compiled for (SDD-58 §3.3). The text of the graph arrives already
   * translated — the host reads it through `localizedIo` — so what is left for the emit is what
   * no file says: whether the page carries the language alternates, which it does with two or
   * more locales. The `lang` of the document is its layout's (SDD-88). Absent, the
   * output is byte for byte what it was before translations existed.
   */
  readonly i18n?: LocaleCompile;
  /**
   * How a place is written in `data-fud-src`: an absolute file and an offset in its text, as
   * `<file>:<line>:<column>`. With it, every element a template writes carries `data-fud-src`
   * with the place of its opening tag — in the snippet's file for a snippet's element — on the
   * server and on the client alike. INJECTED: the compiler reads no file and knows no root.
   * Absent, the output is byte for byte what it was.
   */
  readonly sourceLocations?: SourceLocator;
  /**
   * The style guides of the entry's chain, root first (SDD-79): each linked by every page as a
   * sheet of the document, pruned like one, before the sheets of its layout and its own. Absent,
   * and the output is byte for byte what it was.
   */
  readonly guides?: readonly GuideSheet[];
  /**
   * Spec of the favicon to write when no `<head>` of the page links one: the guide's icon,
   * relative to the entry. The author's own `<link rel="icon">` wins.
   */
  readonly icon?: string;
}

/** A style guide as the emit receives it: its entry sheet, flattened by the host's reads. */
export interface GuideSheet {
  /** Spec of the guide's entry sheet, relative to the entry being compiled. */
  readonly spec: string;
  readonly sheet: FlatSheet;
}

export type { ComponentSpecifier, LayoutSpecifier, ProjectStyle };

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
  /**
   * What this page kept of each sheet it receives (SDD-49 §4.9) — present only for a page or
   * a route compiled with `pruneStyles`. The host adds them up across the application.
   */
  readonly sheets?: readonly SheetUse[];
  /**
   * What the page needs before its body, from its own document (SDD-70 §3.10): the copies of
   * the sheets its head links, its layout's first. Present with `sheets`. The host adds what only
   * the build knows — the runtime the page loads — and writes them into the route manifest.
   */
  readonly hints?: readonly EarlyHint[];
  /**
   * What this module puts in a page that a Content-Security-Policy has to let in (SDD-84 §3.4),
   * declared by the code that writes it. The build compares them with `page.headers`.
   */
  readonly needs: readonly CspNeed[];
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
function componentCss(doc: ComponentDocument): string {
  const style = componentStyleNode(doc);
  if (!style) return '';
  return compactStyleCss(style);
}

/**
 * The tags of the graph that actually carry a shared stylesheet (BUG-31 §T4).
 *
 * A component with no `<style>` — or one whose body compacts to nothing — used to travel
 * the whole style path anyway: an entry in `COMPONENTS`, an empty
 * `<style type="module" specifier>` in the head, `shadowrootadoptedstylesheets` on its
 * template and `data-fud-adopt` on its host. The consequence was on the CLIENT, where the
 * polyfill built a constructable stylesheet out of that empty text and adopted it into
 * every instance. The emit has the CSS right here, so it is the one that decides.
 *
 * The predicate is the COMPACTED text and not the presence of the element: `<style></style>`
 * and a body of pure whitespace are the same fact as no `<style>` at all.
 */
export function styledTags(graph: ComponentGraph): ReadonlySet<string> {
  const styled = new Set<string>();
  for (const comp of allComponents(graph)) {
    if (componentCss(comp.doc) !== '') styled.add(comp.tag);
  }
  return styled;
}

/**
 * The sheets ONE component wears as files, by URL, joined by a space in adoption order — the
 * project's first, its own last — or `''` when it wears none (SDD-73 §3.5). `undefined` when
 * the host publishes no files (`componentSheet` absent): the page adopts style modules, as ever.
 *
 * The same list for the same tag from any module that writes its host — a page, a layout, a
 * component, a client chunk — because a URL is named by the content it holds: the component's
 * `url(…)` are resolved from its own file before they are linked, so whoever compiles it gets
 * the same bytes, and the same file. A project sheet is published whole: a client chunk is
 * shared by every page, and a copy pruned for one page is not one it can name.
 */
export function sheetUrlsOf(
  graph: ComponentGraph,
  options: EmitOptions,
  linker: AssetLinker,
): ((tag: string) => string) | undefined {
  const publish = options.componentSheet;
  if (publish === undefined) return undefined;
  const adopt = projectAdoptOf(options.projectStyles, options.styleChains);
  const project = new Map((options.projectStyles ?? []).map((s) => [s.specifier, projectCss(s)]));
  const projectUrl = (specifier: string): string[] => {
    const css = project.get(specifier);
    return css === undefined ? [] : [publish(specifier, linker.cssLinked(compactProjectCss(css)))];
  };
  // The entry, when it is a component, is no component of its own graph: its client chunk
  // still has to know its list, to step over the `<link>`s its root opens with.
  const self = entryComponent(graph);
  return (tag) => {
    const urls = adopt(tag).split(' ').filter((s) => s !== '').flatMap(projectUrl);
    const comp = graph.components.get(tag) ?? (self?.tag === tag ? self : undefined);
    const css = comp === undefined ? '' : componentCss(comp.doc);
    if (comp !== undefined && css !== '') {
      const own = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gu, (whole, q: string, spec: string) =>
        isRelativeUrl(spec) ? `url(${q}${rebaseSpec(spec, comp.path, graph.entryPath)}${q})` : whole,
      );
      urls.push(publish(tag, linker.cssLinked(own)));
    }
    return urls.join(' ');
  };
}

/**
 * The hints of a page (SDD-73 §3.5): the sheets its heads link, then — with `css: "link"` —
 * the files its components wear, each once, behind them. Before the modules, which the host
 * appends.
 */
export function pageHintsOf(
  sheets: PageSheets,
  graph: ComponentGraph,
  options: EmitOptions,
  linker: AssetLinker,
): readonly EarlyHint[] {
  const urls = sheetUrlsOf(graph, options, linker);
  if (urls === undefined) return sheets.hints;
  const files = new Set(allComponents(graph).flatMap((c) => urls(c.tag).split(' ').filter((u) => u !== '')));
  for (const hint of sheets.hints) files.delete(hint.href);
  return [...sheets.hints, ...[...files].map((href): EarlyHint => ({ href, rel: 'preload', as: 'style' }))];
}

/** `{ sheets }` for a markup emitter's options when the host publishes files, `{}` otherwise. */
export function withSheets(
  graph: ComponentGraph,
  options: EmitOptions,
  linker: AssetLinker,
): { readonly sheets?: (tag: string) => string } {
  const sheets = sheetUrlsOf(graph, options, linker);
  return sheets === undefined ? {} : { sheets };
}

/** A `url(…)` written relative to the file that holds it: not absolute, a scheme or a fragment. */
const isRelativeUrl = (spec: string): boolean => !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/iu.test(spec);

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

/**
 * What a COMPONENT file knows about the boxes around its markup (BUG-21 §3.3).
 *
 * `of(tag)` is the source no external tool can have: the `:host` of the child component, read
 * from the child's own `<style>` through the graph. It is resolved here, beside `spaceModeOf`,
 * for the same reason — this is where the graph and the parsed stylesheets are — and the two
 * emit branches receive the same object so they cannot answer it differently (§4.5).
 */
export function componentBoxes(graph: ComponentGraph, comp: ResolvedComponent): Boxes {
  return {
    of: (tag: string): Display => {
      const child = graph.components.get(tag);
      return child === undefined ? 'unknown' : hostDisplay(componentStyleNode(child.doc));
    },
    // A `display` outside `:host` may select anything in this file, and without a rule tree
    // (SDD-09 §7) there is no telling what: the tag table drops out for the whole file.
    poisoned: hasForeignDisplay(componentStyleNode(comp.doc)),
  };
}

/** The box a component's own template starts in: its `:host`, or nothing provable (§4.3.a). */
export function componentContainer(comp: ResolvedComponent): Display {
  return hostDisplay(componentStyleNode(comp.doc));
}

function buildComponentModule(
  graph: ComponentGraph,
  comp: ResolvedComponent,
  options: EmitOptions,
): { writer: CodeWriter; linker: AssetLinker; diagnostics: readonly Diagnostic[] } {
  const ext = options.importExt ?? '.mjs';
  const linker = new AssetLinker(
    options.linkAssets ?? false,
    options.assetExists,
    options.assetUrl,
    options.assetText,
  );
  // No host template — a file of bare markup, a host with none (`FUD0156`, `FUD0157`): there is
  // no component to emit, and the structure already said why. An empty module, never a throw.
  if (comp.doc.template === undefined) return { writer: new CodeWriter(), linker, diagnostics: [] };
  const { props, signals, neutral, diagnostics, di } = codeOf(comp);
  const cells = cellSlots(comp, graph);
  const hydratable = hydratableTags(graph);
  const bodyW = new CodeWriter();
  const space = spaceModeOf(comp.tag, componentStyleNode(comp.doc));
  // A component OWNS a container as soon as it declares one provider, whatever zone it went
  // to — the map has to have a node for it either way, because the node is what the browser
  // rebuilds the chain from.
  const owns = di.some((d) => d.kind === 'provide');
  // The same predicate the client chunk uses, so what the server writes down and what the
  // chunk destructures cannot disagree.
  const injects = di.some((d) => d.kind === 'inject');
  // Resolved once, for both branches: the client chunk builds the very same nodes from the
  // very same plan, or `h` adopts a tree it does not recognise (SDD-34 §4.3).
  const associated = formAssociatedTags(graph);
  const controls = planControls(comp.source, comp.doc.template!.children, {
    isComponent: (t) => graph.components.has(t),
    isFormAssociated: (t) => associated.has(t),
    field: apiFields(graph),
    template: comp.doc.template!,
  });
  const em = new MarkupEmitter({
    source: comp.source,
    ...stampOption(options, comp.path, comp.path === graph.entryPath ? graph.entryMap : undefined),
    w: bodyW,
    isComponent: (t) => graph.components.has(t),
    linker,
    space,
    container: componentContainer(comp),
    boxes: componentBoxes(graph, comp),
    signals: reactiveScope(comp),
    declared: childTargets(graph),
    hydratable,
    ...(owns ? { ioc: '$own' } : {}),
    controls,
    formAssociated: associated,
    bridges: bridgeIds(graph),
    shadowOptions: shadowOptions(graph),
    styled: styledTags(graph),
    projectAdopt: projectAdoptOf(options.projectStyles, options.styleChains),
    ...withSheets(graph, options, linker),
  });
  // The host's own attributes FIRST, so `$host` is declared before anything below could read
  // it — and inside the markup body, which `appendWriter` puts after the props, the inert
  // reactives and the neutral zone (BUG-32 T2).
  if (comp.doc.host !== undefined) em.emitHost(comp.doc.host);
  em.emitChildren(comp.doc.template!.children, '$shadow');
  // css uses the linker too (may register more imports), so build it before the imports.
  const css = linker.cssTemplate(componentCss(comp.doc));

  const w = new CodeWriter();
  const specifier = specifierResolver(graph, options.componentSpecifier, ext);
  // The helpers the rewrite named, and only those: `inject(…)` became `injectFrom($ioc, …)`
  // and `provide(…)` became `provideIn($own, …)`, so the author's own `@fudic/di` import —
  // which travels below with the rest of the zone — no longer covers what this module calls.
  const helpers = diHelpers(di, (call) => call.zone !== 'client');
  if (helpers.length > 0) w.line(`import { ${helpers.join(', ')} } from '@fudic/di';`);
  // What the `.fudapi` it links give the view, from their server variant (SDD-60 §3.14).
  const linked = apiImports(graph);
  for (const line of linked) w.line(line);
  // The one function that decides a summary's list on both ends (BUG-42 §4.6).
  if (em.summaries) w.line("import { summaryEntriesOf } from '@fudic/forms';");
  for (const tag of em.used) w.line(`import { render as ${renderName(tag)} } from ${specifier(tag)};`);
  // The neutral zone's imports, hoisted — decision 33.c, which until SDD-34 was true of
  // `@client` alone. It is what lets a form live in its own `.ts` and be reached by BOTH
  // ends: the server renders its values into the HTML and the client hydrates the same
  // object, which is the whole reason a form is not declared in the view.
  const neutralImports = neutral.flatMap((s) => (s.hoisted ? [s.text] : []));
  for (const line of neutralImports) w.line(line);
  for (const line of linker.imports()) w.line(line);
  const preamble =
    helpers.length > 0 ||
    linked.length > 0 ||
    em.summaries ||
    em.used.size > 0 ||
    neutralImports.length > 0 ||
    linker.imports().length > 0;
  if (preamble) w.line('');
  w.line(`export const tag = ${JSON.stringify(comp.tag)};`);
  w.line(`export const css = ${css};`);
  w.line('');
  // The fourth parameter is the container this component resolves from, and every component
  // declares it whether or not it uses one: a component has no way of knowing whether the
  // page it lands in has DI, and forwarding a container it never names costs nothing.
  w.line('export function render($dom, $shadow, props, $ioc) {');
  w.indent();
  if (props.length > 0) {
    // The keys a rest gathers are not named in the pattern: the `...rest` itself collects them,
    // exactly as the author wrote it.
    const named = props.filter((p) => p.rest === undefined);
    const pattern = [
      ...named.map((p) => p.name),
      ...[...restGroups(props).keys()].map((rest) => `...${rest}`),
    ].join(', ');
    // `let` when a default is assigned after the pattern: absent is `null` too (SDD-61 §4.4).
    const defaults = propDefaults(props);
    w.line(`${defaults === '' ? 'const' : 'let'} { ${pattern} } = props ?? {};${defaults === '' ? '' : ` ${defaults}`}`);
  }
  if (owns) {
    // Numbered and recorded in the same step, because the map the browser rebuilds the chain
    // from is written while this walk happens (SDD-38 §4.2).
    w.line(`const $own = $ioc.child(${JSON.stringify(comp.tag)});`);
    // And written on its host: what the browser creates inside its view later — a row of a block
    // of a component it renders — finds the container through it (SDD-85, `core/hydrate/scope.ts`).
    w.line(`$dom.setAttr($dom.host($shadow), 'data-fud-ioc', String($own.index));`);
    // From here down this component resolves from the container it owns, so a `provide` and
    // an `inject` of the same token in one `@code` meet — which is §1's property 2 read from
    // the inside.
    w.line('$ioc = $own;');
  }
  // The slice of this instance. It is written HERE when the component publishes no cell, so
  // a page without one keeps the exact bytes it had; a component WITH cells has to wait for
  // its reactives to be declared, a few lines down, because what it registers is those very
  // objects (BUG-24 §4.2).
  //
  // **Every component contributes one, with no level filter** — the same rule the client
  // chunk follows, and for the same reason. A component has no level of its own: one that is
  // level 1 alone becomes level 3 the moment an ancestor hands it a reactive prop, and the
  // Vite plugin compiles each `.fud` on its own, so asking the local graph would answer NO
  // for exactly the components that are hydratable only by induction — a grandchild down a
  // drilling chain — and leave them with a reserved slice nobody ever filled. Who reads it is
  // the PAGE's business: an unclaimed host has no slice, and `state` on one does nothing.
  const writeState = (): void => {
    // The slice of this instance, contributed by the CHILD and not by the parent's host —
    // and it is NOT `Object.values(props)`. Two reasons, and both are visible right here.
    // The ORDER is the child's: these locals are what the client factory destructures, in
    // the order this component declared its props, which is the order `markup-client.ts`
    // already composes the array of `u` in. And the DEFAULTS are already applied by the
    // line above: JSON has no holes, so a prop the parent omitted would travel as `null`,
    // and `null` does not trigger a destructuring default (`variant` would land as `null`
    // instead of `'default'`). A component with no props emits `[]` — an empty slice is
    // information, not absence.
    //
    // The cells follow, in the order `cellSlots` laid them out — the very order the client
    // chunk destructures them in. Each one hands over its live object and, beside it, the
    // value it serialises as: a signal READ, because in SSR the signal exists and reading it
    // is how the page was painted, and nothing at all for a callback, which has none.
    const cellDecls = cells
      .map((c) => (c.kind === 'signal' ? `{ of: ${c.name}, value: ${c.name}() }` : `{ of: ${c.name} }`))
      .join(', ');
    // And LAST, behind both, the node of the container this instance resolves from — but
    // only when it injects, because that is the only reader (SDD-38 §4.5). At the end and
    // not at the front: a partial `u` indexes by position, and a hole in front would shift
    // every prop by one.
    const trailing =
      cells.length === 0 && !injects ? '' : `, [${cellDecls}]${injects ? ', $ioc.index' : ''}`;
    // A gathered key travels in its own slot, read off the rest object it landed in.
    const slice = props.map((p) => (p.rest === undefined ? p.name : `${p.rest}.${p.name}`)).join(', ');
    w.line(`$dom.state($shadow, [${slice}]${trailing});`);
  };
  if (cells.length === 0) writeState();
  for (const s of signals) {
    // Inert reactive: SSR contributes the state as it starts and nothing else. A FUNCTION,
    // because that is the shape the client has — since SDD-31 §4.0 the call form is the only
    // way to read, so a template that says `expanded()` has to mean the same thing on both
    // branches. The object with a `peek` this used to be was not callable, and the day the
    // author wrote the call form it compiled on the client and threw in the prerender.
    writeInert(w, s);
  }
  // A callback that crosses by reference is declared in `@code { @client }`, which the server
  // never evaluates — so the name the body is about to hand the child does not exist here. It
  // is stubbed for the same reason a signal is rendered inert: what the SERVER needs from it
  // is not its behaviour but its IDENTITY, which is what `state` registers the cell under and
  // what turns the child's slot into a marker (BUG-24 §4.6). Nothing calls it: a handler is
  // hookup, and there is no hookup in SSR.
  for (const cell of cells) {
    if (cell.kind === 'fn') w.line(`const ${cell.name} = () => {}; // inert callback (SSR)`);
  }
  if (cells.length > 0) writeState();
  // The neutral zone's body, AFTER the props and the inert reactives it may read, and BEFORE
  // the markup that reads it. This is the half of `@code` that runs on BOTH sides, so this is
  // where the server gets the form it renders the values of. A `provide` is here in full —
  // this is the side that owns the container — while the browser gets it from the route's
  // IoC module instead (SDD-38 §4.5).
  for (const statement of neutral) {
    // `mappedLine`, not `line`: this is the author's own code, verbatim, and the anchor is
    // what lets a breakpoint in the `.fud` find it. Renders byte-identically.
    if (!statement.hoisted)
      w.mappedLine({ text: statement.text, src: statement.at, anchors: statement.anchors });
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
    needs: [],
    diagnostics,
  };
}

