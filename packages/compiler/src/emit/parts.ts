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
import type { ComponentGraph, ResolvedComponent, ResolvedLayout } from './resolve.js';
import type { CodeWriter } from './writer.js';
import { AssetLinker } from './assets.js';
import { isAssetAttr } from './markup.js';
import { isLiteralText, literalText } from './runs.js';

export const slice = (source: string, sp: Span): string => source.slice(sp.start, sp.end);

/** Injected resolver: the specifier under which the importing module imports `component`. */
export type ComponentSpecifier = (component: ResolvedComponent) => string;

/** Injected resolver: the specifier under which a route/layout imports its layout. */
export type LayoutSpecifier = (layout: ResolvedLayout) => string;

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
      JSON.stringify(source.slice(el.span.start, first.span.start)) +
      ` + ${binding} + ` +
      JSON.stringify(source.slice(last.span.end, el.span.end))
    );
  }
  // The element ALONE: no indent, no newline around it (BUG-07 §4.2). Whitespace between
  // the children of `<head>` is dropped by the parser before the tree exists.
  return JSON.stringify(source.slice(el.span.start, el.span.end));
}

/**
 * The JS expression for a `<title>`'s content: text runs plus escaped interpolations.
 *
 * A title is text like any other, so its literal pieces go through `literalText` — which is
 * what makes `<title>@@fudic</title>` print an `@` here too, and not only in the body.
 */
export function titleExpr(source: string, el: ElementNode): string {
  const inner = el.children
    .map((c) =>
      c.type === 'razor-expression'
        ? `escapeText(String((${slice(source, c.expr)}) ?? ''))`
        : isLiteralText(c)
          ? JSON.stringify(literalText(c))
          : "''",
    )
    .join(' + ');
  return inner || "''";
}

/**
 * The `$nonce` binding of the CSP nonce of THIS response (SDD-20 §4.9). The style-adoption
 * polyfill is an inline script, so without it a strict `script-src 'self'` kills it and no
 * shadow root adopts a sheet. Absent (a plain `renderToString`), the output is unchanged.
 *
 * It is written HERE, once, because two roles emit that polyfill — a page and a route. A
 * copy in either would silently drift: the nonce is invisible in any test whose `io` does
 * not carry one, and the failure only shows up in a browser under a real CSP.
 */
export function writeNonceBinding(w: CodeWriter): void {
  w.line("const $nonce = io.nonce ? ' nonce=\"' + io.nonce + '\"' : '';");
}

/**
 * The head contribution every rendered document shares: the style-adoption polyfill (SDD-18
 * §5) with its nonce, then one `<style type="module" specifier>` per component of the graph.
 * The polyfill goes out BEFORE the body streams, so its observer adopts each host sheet as
 * it arrives; the style modules follow it.
 */
export function writeSharedHead(w: CodeWriter): void {
  w.line('// The style-adoption polyfill (SDD-18 §5) goes in <head>, live BEFORE the body streams,');
  w.line('// so its observer adopts each host sheet as it arrives; the style modules follow it.');
  w.line("head += '<script' + $nonce + '>' + STYLE_POLYFILL + '</script>';");
  w.line(
    "head += COMPONENTS.map(function (c) { return '<style type=\"module\" specifier=\"' + c.tag + '\">' + c.css + '</style>'; }).join('');",
  );
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
      w.line(`head += '<title>' + (${titleExpr(source, child)}) + '</title>';`);
    } else {
      w.line(`head += ${headElementExpr(source, child, options.linker)};`);
    }
  }
  // A layout whose `@RenderHead()` sits deeper than a direct child of `<head>` (or none at
  // all, FUD0425): the route's contributions still go out, at the end of the head.
  if (!injected && options.onInject !== undefined) options.onInject();
}
