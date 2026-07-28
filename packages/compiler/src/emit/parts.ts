/**
 * Emit pieces shared by the four document roles. They live here — and not in `module.ts` —
 * because SDD-21 made every one of them have two callers: a page and a layout both write a
 * `<head>`, a page and a route both interpolate a `<title>`, a component module and a layout
 * module both import their children by tag.
 *
 * Text only, like the rest of the emit: no runtime is imported and no filesystem is touched.
 */

import type { ElementNode, HtmlContent } from '../html/index.js';
import type { Span } from '../types/index.js';
import type { ComponentGraph, ResolvedComponent } from './resolve.js';
import type { CodeWriter } from './writer.js';
import { AssetLinker } from './assets.js';
import { isAssetAttr } from './markup.js';

export const slice = (source: string, sp: Span): string => source.slice(sp.start, sp.end);

/** Injected resolver: the specifier under which the importing module imports `component`. */
export type ComponentSpecifier = (component: ResolvedComponent) => string;

/** Injected resolver: the specifier under which a route/layout imports its layout. */
export type LayoutSpecifier = (layout: { readonly path: string }) => string;

/** A module specifier as a quoted JS string literal. */
export function quoteSpecifier(spec: string): string {
  return `'${spec.replace(/\\/gu, '\\\\').replace(/'/gu, "\\'")}'`;
}

/**
 * The specifier of a linked component BY TAG: the injected resolver when the host provides
 * one (it knows where the file lives), else the sibling-file default.
 */
export function specifierResolver(
  graph: ComponentGraph,
  injected: ComponentSpecifier | undefined,
  ext: string,
): (tag: string) => string {
  return (tag: string): string => {
    const component = graph.components.get(tag);
    const spec =
      injected !== undefined && component !== undefined ? injected(component) : `./${tag}${ext}`;
    return quoteSpecifier(spec);
  };
}

/**
 * A page `<head>` element as a JS string expression: its verbatim source, with a static,
 * relative asset URL (`<link href>`, `<script src>`) spliced out and replaced by the import
 * binding Vite resolves and hashes (SDD-19 §4.5). Without a linkable URL this is just the
 * quoted source slice.
 */
export function headElementExpr(source: string, el: ElementNode, linker: AssetLinker): string {
  for (const attr of el.attributes) {
    if (typeof attr.name !== 'string' || !isAssetAttr(el.name, attr.name)) continue;
    const parts = attr.value;
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (parts.length === 0 || first === undefined || last === undefined) continue;
    if (!parts.every((p) => p.type === 'attribute-text')) continue; // interpolated: leave alone
    const binding = linker.maybeRef(parts.map((p) => (p as { value: string }).value).join(''));
    if (binding === null) continue; // linking off, already-final URL, or missing file
    return (
      JSON.stringify('  ' + source.slice(el.span.start, first.span.start)) +
      ` + ${binding} + ` +
      JSON.stringify(source.slice(last.span.end, el.span.end) + '\n')
    );
  }
  return JSON.stringify('  ' + source.slice(el.span.start, el.span.end) + '\n');
}

/** The JS expression for a `<title>`'s content: text runs plus escaped interpolations. */
export function titleExpr(source: string, el: ElementNode): string {
  const inner = el.children
    .map((c) =>
      c.type === 'razor-expression'
        ? `escapeText(String((${slice(source, c.expr)}) ?? ''))`
        : c.type === 'text'
          ? JSON.stringify(c.value)
          : "''",
    )
    .join(' + ');
  return inner || "''";
}

/**
 * Write the `head += …` statements for the elements of a `<head>`: every element the author
 * wrote passes VERBATIM (so a page keeps its favicon, its stylesheet and its `<script src>`),
 * except `<title>`, which is interpolated, and the framework links, which are the component /
 * layout graph and never output.
 *
 * `onInject` fires when the walk reaches `injectAt` (a layout's `@RenderHead()`), which is how
 * SDD-21 §4.4 puts the route's contributions in the author's chosen place.
 */
export function writeHeadElements(
  source: string,
  head: ElementNode,
  options: {
    readonly skip: ReadonlySet<HtmlContent>;
    readonly linker: AssetLinker;
    readonly injectAt?: HtmlContent;
    readonly onInject?: () => void;
  },
  w: CodeWriter,
): void {
  let injected = false;
  for (const child of head.children) {
    if (options.injectAt !== undefined && child === options.injectAt) {
      options.onInject?.();
      injected = true;
      continue;
    }
    if (child.type !== 'element' || options.skip.has(child)) continue;
    if (child.name === 'title') {
      w.line(`head += '<title>' + (${titleExpr(source, child)}) + '</title>\\n';`);
    } else {
      w.line(`head += ${headElementExpr(source, child, options.linker)};`);
    }
  }
  // A layout whose `@RenderHead()` sits deeper than a direct child of `<head>` (or none at
  // all, FUD0425): the route's contributions still go out, at the end of the head.
  if (!injected && options.onInject !== undefined) options.onInject();
}
