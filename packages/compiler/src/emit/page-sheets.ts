/**
 * The sheets of ONE page, pruned and turned into what its `<head>` writes (SDD-49 §4.6).
 *
 * A layout is compiled once and shared by every route that links it, so it cannot know which
 * page it paints. The route can: its graph reaches the whole page — its markup, its sections,
 * the layout's body and every component of either. So the route prunes every sheet the page
 * receives — the ones its layout links, its own, and the project's — and hands the layout the
 * finished element for each of the layout's under a key the two agree on (`sheetKey`), the
 * same way it already answers `route.runtime(inline)`.
 *
 * Everything here happens at compile time. The module carries constants, and nothing is
 * decided when a page is painted.
 */

import type { ElementNode } from '../html/index.js';
import { isComponentLink, isLayoutLink, isSnippetLink } from '../document/index.js';
import type { AssetLinker } from './assets.js';
import { compactStyleCss } from './css-compact.js';
import { componentStyleNode, type EmitOptions } from './module.js';
import { asksInline, linkWithHref, prunableHref, sheetKey } from './parts.js';
import { projectAdoptOf, type ProjectStyle } from './project-styles.js';
import { prunePage, type PageSheet } from './prune.js';
import { allComponents, type DocumentGraph } from './resolve.js';
import { documentSurface, shadowSurface, unionSurfaces } from './surface.js';

/**
 * What a page kept of one sheet, for the host: the file behind it — `spec`, relative to the
 * compiled entry — or the project sheet's `specifier`, and the pruned CSS (`''` when nothing
 * was left). It is how the build learns, page by page, which sheets nobody uses (`FUD0852`).
 */
export type SheetUse =
  | { readonly spec: string; readonly css: string }
  | { readonly specifier: string; readonly css: string };

/** A `<link>` of a `<head>` the page delivers pruned. */
interface LinkedSheet {
  readonly key: string;
  readonly el: ElementNode;
  /** The `.fud` whose text `el` is written in. */
  readonly source: string;
  /** The `href` as the author wrote it. */
  readonly href: string;
  /** The same file, relative to the entry being compiled. */
  readonly spec: string;
  readonly css: string;
}

export interface PageSheets {
  /** The element for each of the layout's keys: what `route.sheet(key)` returns. */
  readonly layout: ReadonlyMap<string, string>;
  /** What an element of the entry's own `<head>` becomes, or `null` to write it as ever. */
  readonly own: (el: ElementNode) => string | null;
  /** The project's sheets, pruned; one no component of this page adopts is not here. */
  readonly projectStyles: readonly ProjectStyle[] | undefined;
  readonly uses: readonly SheetUse[];
}

const isFrameworkLink = (el: ElementNode): boolean =>
  isComponentLink(el) || isLayoutLink(el) || isSnippetLink(el);

/** The directory segments of a file path, whatever its separators. */
function dirSegments(file: string): string[] {
  const parts = file.replace(/\\/gu, '/').split('/');
  parts.pop();
  return parts;
}

/**
 * `spec`, written in `from`, as the same file seen from `to`.
 *
 * The route reads its layout's sheets through its OWN linker, which resolves against the
 * route's directory — and the author wrote them against the layout's. Plain segment arithmetic
 * over the two absolute paths the graph already holds: the compiler has no `node:path`.
 */
export function rebaseSpec(spec: string, from: string, to: string): string {
  const q = spec.indexOf('?');
  const path = q === -1 ? spec : spec.slice(0, q);
  const query = q === -1 ? '' : spec.slice(q);
  const target = dirSegments(from);
  for (const seg of path.split('/')) {
    if (seg === '..') target.pop();
    else if (seg !== '.' && seg !== '') target.push(seg);
  }
  const base = dirSegments(to);
  let common = 0;
  while (common < base.length && common < target.length - 1 && base[common] === target[common]) {
    common += 1;
  }
  const rel = [...base.slice(common).map(() => '..'), ...target.slice(common)].join('/');
  return (rel.startsWith('..') ? rel : `./${rel}`) + query;
}

/** The prunable `<link>`s of one `<head>`, in order, each resolved as the entry sees it. */
function linkedSheets(
  head: ElementNode,
  source: string,
  linker: AssetLinker,
  key: (ordinal: number) => string,
  resolve: (href: string) => string,
): LinkedSheet[] {
  const out: LinkedSheet[] = [];
  for (const child of head.children) {
    if (child.type !== 'element' || isFrameworkLink(child)) continue;
    const href = prunableHref(child, linker, resolve);
    if (href === null) continue;
    const spec = resolve(href);
    out.push({ key: key(out.length), el: child, source, href, spec, css: linker.textOf(spec)! });
  }
  return out;
}

/** The element a pruned `<link>` becomes: a `<link>` to the copy, a `<style>`, or nothing. */
function sheetElement(sheet: LinkedSheet, css: string, linker: AssetLinker): string {
  if (css === '') return "''";
  if (asksInline(sheet.href)) {
    return `'<style' + $nonce + '>' + ${linker.cssTemplate(css)} + '</style>'`;
  }
  const url = linker.sheetRef(sheet.spec, css);
  if (url !== null) return linkWithHref(sheet.source, sheet.el, JSON.stringify(url));
  // No host publishes copies: the file as it is, under the URL it always had.
  const whole = linker.maybeRef(sheet.spec, 'head') ?? JSON.stringify(sheet.href);
  return linkWithHref(sheet.source, sheet.el, whole);
}

/**
 * Prune every sheet of the page the graph describes, or `null` when the build did not ask
 * for it (`pruneStyles` absent) — and then the emit is what it was before SDD-49.
 */
export function planPageSheets(
  graph: DocumentGraph,
  options: EmitOptions,
  linker: AssetLinker,
): PageSheets | null {
  if (options.pruneStyles !== true) return null;
  const entryHead = 'head' in graph.entry ? graph.entry.head : undefined;

  // The layouts' sheets. A layout names no layout (FUD0439), so the chain is at most one
  // deep and its only layout has no ancestor: depth 0.
  const layoutSheets = graph.layouts.flatMap((layout, i) =>
    linkedSheets(
      layout.doc.head,
      layout.source,
      linker,
      (ordinal) => sheetKey(graph.layouts.length - 1 - i, ordinal),
      (href) => rebaseSpec(href, layout.path, graph.entryPath),
    ),
  );
  const ownSheets =
    entryHead === undefined
      ? []
      : linkedSheets(entryHead, graph.entrySource, linker, (ordinal) => `head:${ordinal}`, (h) => h);

  const document = documentSurface(graph);
  const linked = [...layoutSheets, ...ownSheets];
  const sheets: PageSheet[] = linked.map((s) => ({
    key: s.key,
    css: s.css,
    scope: 'document',
    surface: document,
  }));

  const adopt = projectAdoptOf(options.projectStyles, options.styleChains);
  const components = allComponents(graph);
  const adopted = new Map<string, boolean>();
  for (const style of options.projectStyles ?? []) {
    const adopters = components.filter((c) => adopt(c.tag).split(' ').includes(style.specifier));
    adopted.set(style.specifier, adopters.length > 0);
    sheets.push({
      key: `project:${style.specifier}`,
      css: style.css,
      scope: 'shadow',
      surface: unionSurfaces(adopters.map((c) => shadowSurface(graph, c.tag))),
    });
  }
  // A `<style>` written in a document's head — the layout's or the entry's — is never pruned
  // either, and what it says names fonts and animations just the same.
  const heads = [
    ...graph.layouts.map((l) => ({ head: l.doc.head, source: l.source })),
    ...(entryHead === undefined ? [] : [{ head: entryHead, source: graph.entrySource }]),
  ];
  for (const { head, source } of heads) {
    for (const child of head.children) {
      const body = child.type === 'element' && child.name === 'style' ? child.children[0] : undefined;
      if (body === undefined || body.type !== 'style-content') continue;
      sheets.push({
        key: `head-style:${body.span.start}`,
        css: compactStyleCss(source, body),
        scope: 'document',
        surface: document,
        reference: true,
      });
    }
  }
  // A component's own `<style>` is never pruned, but what it keeps names fonts and animations.
  for (const c of components) {
    const style = componentStyleNode(c.doc);
    if (style === null) continue;
    sheets.push({
      key: `component:${c.tag}`,
      css: compactStyleCss(c.source, style),
      scope: 'shadow',
      surface: shadowSurface(graph, c.tag),
      reference: true,
    });
  }

  const pruned = prunePage(sheets);
  const cssOf = new Map(pruned.value.map((s) => [s.key, s.css]));

  const layout = new Map(layoutSheets.map((s) => [s.key, sheetElement(s, cssOf.get(s.key)!, linker)]));
  const own = new Map(ownSheets.map((s) => [s.el, sheetElement(s, cssOf.get(s.key)!, linker)]));
  // An adopted sheet that came out empty is still registered, empty: the adopted lists that
  // name it are written in the modules of components, shared by every page, and a list that
  // names a sheet the document never registered keeps its host waiting for it.
  const projectStyles = options.projectStyles
    ?.filter((s) => adopted.get(s.specifier))
    .map((s) => ({ specifier: s.specifier, css: cssOf.get(`project:${s.specifier}`)! }));
  const uses: SheetUse[] = [
    ...linked.map((s) => ({ spec: s.spec, css: cssOf.get(s.key)! })),
    ...(options.projectStyles ?? []).map((s) => ({
      specifier: s.specifier,
      css: adopted.get(s.specifier) ? cssOf.get(`project:${s.specifier}`)! : '',
    })),
  ];
  // What the sheets have to say about themselves (`sheetDiagnostics`) is not returned: their
  // spans are over the sheet's text, and the host — which knows the file — reports them once.
  return { layout, own: (el) => own.get(el) ?? null, projectStyles, uses };
}
