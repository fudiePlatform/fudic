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
import type { Span } from '../types/index.js';
import { isComponentLink, isLayoutLink, isSnippetLink } from '../document/index.js';
import type { AssetLinker } from './assets.js';
import { flattenImports, plainSheet, type FileDiagnostic, type FlatSheet } from '../css/index.js';
import type { EmitOptions } from './module.js';
import {
  asksInline,
  deliveredSheet,
  fixedSheetHref,
  HEAD_NEEDS,
  hasIcon,
  linkWithHref,
  prunableHref,
  sheetKey,
} from './parts.js';
import { compactStyleCss } from './css-compact.js';
import type { CspNeed } from '@fudic/config';
import type { StyleNode } from '../css/index.js';
import { compactProjectCss, projectAdoptOf, projectCss, type ProjectStyle } from './project-styles.js';
import { prunePage, sheetDiagnostics, type PageSheet } from './prune.js';
import { allComponents, type DocumentGraph } from './resolve.js';
import { documentSurface, pageTokenConsumers, shadowSurface, unionSurfaces } from './surface.js';

/**
 * What a page kept of one sheet, for the host: the file behind it — `spec`, relative to the
 * compiled entry — or the project sheet's `specifier`, and the pruned CSS (`''` when nothing
 * was left). It is how the build learns, page by page, which sheets nobody uses (`FUD0852`).
 *
 * A linked sheet also says which files its `@import`s flattened in (`files`, every one relative
 * to the entry: what the host watches), which of them kept a rule on this page
 * (`contributing`), what the sheet says about itself (`diagnostics`, each over its own
 * file) — reported by the host once per file, not once per page — and where each file was
 * brought in (`sites`).
 */
export type SheetUse =
  | {
      readonly spec: string;
      readonly css: string;
      readonly files: readonly string[];
      readonly contributing: readonly string[];
      readonly diagnostics: readonly FileDiagnostic[];
      readonly sites: readonly SheetSite[];
    }
  | { readonly specifier: string; readonly css: string };

/**
 * Where one file of a linked sheet was brought into the page: the `<link>` of the root, in the
 * `.fud` that writes it, or the `@import` that first named an imported file. The line an
 * author goes to when the file turns out to be dead CSS (`FUD0852`).
 */
export interface SheetSite {
  /** The file brought in, as in `files`. */
  readonly file: string;
  /** Where: the `.fud`'s path for a `<link>`, the importing file's specifier for an `@import`. */
  readonly at: string;
  /** Over the `<link>` or the `@import`, in the text of `at`. */
  readonly span: Span;
}

/**
 * A sheet of a `<head>` the page delivers pruned: a `<link>` to a file of the project, or —
 * with `css: "link"` — a `<style>` the page moves to a file (SDD-73 §3.5).
 */
interface LinkedSheet {
  readonly key: string;
  readonly el: ElementNode;
  /** The `.fud` whose text `el` is written in. */
  readonly source: string;
  /** Its path, as the graph holds it. */
  readonly path: string;
  /** The `href` as the author wrote it; `''` for a `<style>`. */
  readonly href: string;
  /** The same file, relative to the entry being compiled; the `.fud`'s own for a `<style>`. */
  readonly spec: string;
  /** Its text with every relative `@import` flattened in (§4.2). */
  readonly flat: FlatSheet;
}

/** The `.fud`'s file name without its extension: what a `<style>` moved to a file is named. */
function fudName(path: string): string {
  const file = path.replace(/\\/gu, '/').split('/').pop()!;
  return file.replace(/\.fud$/u, '');
}

export interface PageSheets {
  /** The element for each of the layout's keys: what `route.sheet(key)` returns. */
  readonly layout: ReadonlyMap<string, string>;
  /** What an element of the entry's own `<head>` becomes, or `null` to write it as ever. */
  readonly own: (el: ElementNode) => string | null;
  /** What these elements put in the page that a CSP has to let in (SDD-84 §3.4). */
  readonly needs: readonly CspNeed[];
  /** The project's sheets, pruned; one no component of this page adopts is not here. */
  readonly projectStyles: readonly ProjectStyle[] | undefined;
  readonly uses: readonly SheetUse[];
  /** The copies its head links, to hint before the page (SDD-70 §3.10), in document order. */
  readonly hints: readonly EarlyHint[];
  /** The guides' elements and the guide's icon, as one JS expression; `null` with neither. */
  readonly guide: string | null;
}

/**
 * The guide expression of a page — the pruned one when it prunes, the whole guides when not —
 * and what it needs from the page's CSP.
 */
export function guideOf(
  graph: DocumentGraph,
  options: EmitOptions,
  linker: AssetLinker,
  sheets: PageSheets | null,
): { readonly expr: string | null; readonly needs: readonly CspNeed[] } {
  if (sheets !== null) return { expr: sheets.guide, needs: sheets.needs };
  const guide = pageGuide(graph, options, linker, (i) => compactProjectCss(options.guides![i]!.sheet.css));
  return { expr: guide.expr, needs: guide.needs };
}

/**
 * The style guides and the icon a page writes into its head, as one JS expression, or `null`
 * when it has neither. `cssOf` is what the page kept of each guide; whole when it prunes
 * nothing. Each guide goes as a `<link>` to its copy when the host publishes copies, inside a
 * `<style>` when it does not; one the page kept nothing of goes not at all.
 */
export function pageGuide(
  graph: DocumentGraph,
  options: EmitOptions,
  linker: AssetLinker,
  cssOf: (index: number) => string,
): { readonly expr: string | null; readonly hints: readonly EarlyHint[]; readonly needs: readonly CspNeed[] } {
  const parts: string[] = [];
  const hints: EarlyHint[] = [];
  let embeds = false;
  (options.guides ?? []).forEach((guide, i) => {
    const css = cssOf(i);
    if (css === '') return;
    const url = linker.sheetRef(guide.spec, linker.cssLinked(css));
    if (url === null) {
      embeds = true;
      parts.push(`'<style' + $nonce + '>' + ${linker.cssTemplate(css)} + '</style>'`);
      return;
    }
    parts.push(JSON.stringify(`<link rel="stylesheet" href="${url}">`));
    hints.push({ href: url, rel: 'preload', as: 'style' });
  });
  const heads = [...graph.layouts.map((l) => l.doc.head), 'head' in graph.entry ? graph.entry.head : undefined];
  if (options.icon !== undefined && !heads.some(hasIcon)) {
    const href = linker.maybeRef(options.icon, 'head') ?? JSON.stringify(options.icon);
    parts.push(`'<link rel="icon" href="' + ${href} + '">'`);
  }
  return { expr: parts.length === 0 ? null : parts.join(' + '), hints, needs: embeds ? HEAD_NEEDS.embeddedSheet : [] };
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

/**
 * The sheets one `<head>` delivers, in order, each resolved as the entry sees it: the prunable
 * `<link>`s, and with `linkCss` the `<style>`s too (`deliveredSheet` decides, for both sides).
 */
function linkedSheets(
  head: ElementNode,
  source: string,
  path: string,
  linker: AssetLinker,
  linkCss: boolean,
  key: (ordinal: number) => string,
  resolve: (href: string) => string,
): LinkedSheet[] {
  const out: LinkedSheet[] = [];
  for (const child of head.children) {
    if (child.type !== 'element' || isFrameworkLink(child)) continue;
    if (!deliveredSheet(child, linker, linkCss, resolve)) continue;
    if (child.name === 'style') {
      // A parsed `<style>` always holds exactly one `StyleNode` (see `headStyleExpr`).
      const css = compactStyleCss(source, child.children[0] as StyleNode);
      const name = fudName(path);
      out.push({ key: key(out.length), el: child, source, path, href: '', spec: name, flat: plainSheet(name, css) });
      continue;
    }
    const href = prunableHref(child, linker, resolve)!;
    const spec = resolve(href);
    const flat = flattenImports(spec, linker.textOf(spec)!, (s) => linker.textOf(s));
    out.push({ key: key(out.length), el: child, source, path, href, spec, flat });
  }
  return out;
}

/** Where each file of a linked sheet came in: the root at its `<link>`, the rest at an `@import`. */
function sitesOf(sheet: LinkedSheet): SheetSite[] {
  const [root, ...imported] = sheet.flat.files;
  return [
    { file: root!, at: sheet.path, span: sheet.el.span },
    // Every file past the root was read because an `@import` named it: `flattenImports` saw it.
    ...imported.map((file) => {
      const site = sheet.flat.importedAt!.get(file)!;
      return { file, at: site.file, span: site.span };
    }),
  ];
}

/**
 * A resource the page needs before its body, to announce as early as it can (SDD-70 §3.10): a
 * `Link` of a `103 Early Hints` and of the response. `href` is the URL the document carries.
 */
export interface EarlyHint {
  readonly href: string;
  readonly rel: 'preload' | 'modulepreload';
  /** `style` for a stylesheet; a module needs none. */
  readonly as?: 'style';
}

/**
 * The element a pruned `<link>` becomes — a `<link>` to the copy, a `<style>`, or nothing — and
 * the URL to hint when it is a `<link>` to a copy the host published.
 */
function sheetElement(
  sheet: LinkedSheet,
  css: string,
  linker: AssetLinker,
  componentSheet: EmitOptions['componentSheet'],
): { readonly expr: string; readonly url?: string; readonly embeds?: true } {
  if (css === '') return { expr: "''" };
  // `css: "link"` (SDD-73 §3.5): a `<style>` leaves the page as a file of its own, with the
  // author's attributes (`media`) on the `<link>` that names it, and an `?inline` sheet stays
  // a file. Both are hinted like any other.
  if (componentSheet !== undefined && sheet.el.name === 'style') {
    const url = componentSheet(sheet.spec, linker.cssLinked(css));
    const attrs = sheet.source.slice(sheet.el.openSpan.start + '<style'.length, sheet.el.openSpan.end - 1);
    return { expr: JSON.stringify(`<link rel="stylesheet" href="${url}"${attrs}>`), url };
  }
  if (componentSheet === undefined && asksInline(sheet.href)) {
    return { expr: `'<style' + $nonce + '>' + ${linker.cssTemplate(css)} + '</style>'`, embeds: true };
  }
  // A static file has no import bindings: every `url()` in it is written as its final URL.
  const url = linker.sheetRef(sheet.spec, linker.cssLinked(css));
  if (url !== null) return { expr: linkWithHref(sheet.source, sheet.el, JSON.stringify(url)), url };
  // No host publishes copies: the file as it is, under the URL it always had.
  const whole = linker.maybeRef(sheet.spec, 'head') ?? JSON.stringify(sheet.href);
  return { expr: linkWithHref(sheet.source, sheet.el, whole) };
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
  const linkCss = options.componentSheet !== undefined;

  // The layouts' sheets. A layout names no layout (FUD0439), so the chain is at most one
  // deep and its only layout has no ancestor: depth 0.
  const layoutSheets = graph.layouts.flatMap((layout, i) =>
    linkedSheets(
      layout.doc.head,
      layout.source,
      layout.path,
      linker,
      linkCss,
      (ordinal) => sheetKey(graph.layouts.length - 1 - i, ordinal),
      (href) => rebaseSpec(href, layout.path, graph.entryPath),
    ),
  );
  const ownSheets =
    entryHead === undefined
      ? []
      : linkedSheets(entryHead, graph.entrySource, graph.entryPath, linker, linkCss, (ordinal) => `head:${ordinal}`, (h) => h);

  const document = documentSurface(graph);
  const linked = [...layoutSheets, ...ownSheets];
  // The guides first: the page receives them before anything its heads link.
  const guides = options.guides ?? [];
  const sheets: PageSheet[] = [
    ...guides.map((g, i): PageSheet => ({ key: `guide:${i}`, sheet: g.sheet, scope: 'document', surface: document })),
    ...linked.map((s): PageSheet => ({ key: s.key, sheet: s.flat, scope: 'document', surface: document })),
  ];

  const adopt = projectAdoptOf(options.projectStyles, options.styleChains);
  const components = allComponents(graph);
  const adopted = new Map<string, boolean>();
  for (const style of options.projectStyles ?? []) {
    const adopters = components.filter((c) => adopt(c.tag).split(' ').includes(style.specifier));
    adopted.set(style.specifier, adopters.length > 0);
    sheets.push({
      key: `project:${style.specifier}`,
      sheet: plainSheet(style.specifier, projectCss(style)),
      scope: 'shadow',
      surface: unionSurfaces(adopters.map((c) => shadowSurface(graph, c.tag))),
    });
  }
  const pruned = prunePage(sheets, pageTokenConsumers(graph));
  const cssOf = new Map(pruned.value.map((s) => [s.key, s.css]));
  const contributingOf = new Map(pruned.value.map((s) => [s.key, s.contributing]));

  // In document order: the layout's head goes out first, and its sheets with it.
  const elements = linked.map((s) => ({
    sheet: s,
    ...sheetElement(s, cssOf.get(s.key)!, linker, options.componentSheet),
  }));
  const layout = new Map(elements.filter((e) => layoutSheets.includes(e.sheet)).map((e) => [e.sheet.key, e.expr]));
  const own = new Map(elements.filter((e) => ownSheets.includes(e.sheet)).map((e) => [e.sheet.el, e.expr]));
  // Every sheet the heads link, in document order (SDD-73 §3.4): a pruned one under its copy's
  // URL, one of `public/` or of another origin under the URL the author wrote.
  const copyOf = new Map(elements.flatMap((e) => (e.url === undefined ? [] : [[e.sheet.el, e.url] as const])));
  const heads = [...graph.layouts.map((l) => l.doc.head), ...(entryHead === undefined ? [] : [entryHead])];
  const hints = heads.flatMap((head) =>
    head.children.flatMap((child): EarlyHint[] => {
      if (child.type !== 'element') return [];
      const href = copyOf.get(child) ?? fixedSheetHref(child);
      return href === null ? [] : [{ href, rel: 'preload', as: 'style' }];
    }),
  );
  // An adopted sheet that came out empty is still registered, empty: the adopted lists that
  // name it are written in the modules of components, shared by every page, and a list that
  // names a sheet the document never registered keeps its host waiting for it.
  const projectStyles = options.projectStyles
    ?.filter((s) => adopted.get(s.specifier))
    .map((s) => ({ specifier: s.specifier, css: cssOf.get(`project:${s.specifier}`)! }));
  const uses: SheetUse[] = [
    // A `<style>` is the page's own text and no file of the project: nothing to report on.
    ...linked.filter((s) => s.el.name !== 'style').map((s) => ({
      spec: s.spec,
      css: cssOf.get(s.key)!,
      files: s.flat.files,
      contributing: contributingOf.get(s.key)!,
      diagnostics: sheetDiagnostics(s.flat),
      sites: sitesOf(s),
    })),
    ...(options.projectStyles ?? []).map((s) => ({
      specifier: s.specifier,
      css: adopted.get(s.specifier) ? cssOf.get(`project:${s.specifier}`)! : '',
    })),
  ];
  const guide = pageGuide(graph, options, linker, (i) => cssOf.get(`guide:${i}`)!);
  return {
    layout,
    own: (el) => own.get(el) ?? null,
    projectStyles,
    uses,
    hints: [...guide.hints, ...hints],
    guide: guide.expr,
    needs: guide.needs.length > 0 || elements.some((e) => e.embeds === true) ? HEAD_NEEDS.embeddedSheet : [],
  };
}
