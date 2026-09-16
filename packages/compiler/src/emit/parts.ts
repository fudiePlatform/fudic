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
import type { ExtractedCode } from './oxc-code.js';

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
 * The `src` a layout writes to say «the fudic runtime goes here» (BUG-31 §T1).
 *
 * A layout used to write the tag itself — `<script type="module" src="/fudic-main.js">` —
 * and that one literal is what made the runtime unconditional: it is opaque text to the
 * emit, so nothing could ask whether this page had anything to hydrate, and nothing could
 * give the file a name carrying the build id. A marker moves both decisions to the side that
 * holds the facts, and leaves the layout saying only WHERE.
 *
 * A `<script src>` and not a new `@` directive, because it is the same statement the author
 * was already making, in the same place — and because a `fudic:` specifier is unmistakably
 * not a path, the way `<link rel="component">` is unmistakably not a stylesheet.
 */
export const RUNTIME_MARKER = 'fudic:runtime';

/**
 * Whether this head element is that marker: a `<script>` whose `src` is literally
 * `fudic:runtime`. An interpolated `src` is not one — a marker is a constant by definition.
 */
function isRuntimeMarker(el: ElementNode): boolean {
  if (el.name !== 'script') return false;
  return el.attributes.some(
    (a) =>
      a.name === 'src' &&
      a.value.every((p) => p.type === 'attribute-text') &&
      a.value.map((p) => (p as { value: string }).value).join('') === RUNTIME_MARKER,
  );
}

/**
 * What the marker becomes.
 *
 * `boot` rides every page: fudic is offline-first, so the Service Worker is registered
 * whether or not this page has a line of JavaScript of its own. `main` — the hydration
 * runtime — rides only a page that has something to hydrate.
 *
 * NEITHER is preloaded, and that is the point: a `<link rel="modulepreload">` for a file
 * whose `<script>` is on the next line buys nothing — the tag already starts the fetch — and
 * under the Service Worker the two requests land in different worlds and do not match, which
 * the browser reports as an unused preload. What WOULD earn a preload is the chunks `main`
 * imports, since the browser cannot discover those until it has parsed `main`; their names
 * are a fact of the bundle and do not reach this side.
 *
 * `io.runtime` is absent in a standalone render (a golden, `renderToString`), and then the
 * marker produces nothing at all: there is no build, so there are no URLs to write.
 */
export function writeRuntimeTags(w: CodeWriter, hydrates: boolean): void {
  w.line('if (io.runtime !== undefined) {');
  w.indent();
  w.line(
    "head += '<script type=\"module\" src=\"' + io.runtime.boot + '\"></script>';",
  );
  if (hydrates) {
    w.line("head += '<script type=\"module\" src=\"' + io.runtime.main + '\"></script>';");
  }
  w.dedent();
  w.line('}');
}

/**
 * The head contribution every rendered document shares: the style-adoption polyfill (SDD-18
 * §5) with its nonce, then one `<style type="module" specifier>` per component of the graph.
 * The polyfill goes out BEFORE the body streams, so its observer adopts each host sheet as
 * it arrives; the style modules follow it.
 */
export function writeSharedHead(
  w: CodeWriter,
  hasStyles: boolean,
  hasProjectStyles: boolean,
): void {
  // Nothing to adopt, nothing to adopt it WITH (BUG-31 §T3, widened by SDD-42 §4.4).
  // `COMPONENTS` holds the styled components of the graph and only those, and
  // `PROJECT_STYLES` the project's own; with both empty there is no sheet to register, no
  // host wearing `data-fud-adopt`, and a polyfill that would observe the document for the
  // lifetime of the page to do nothing.
  //
  // The premise BUG-31 was written on — *the only CSS is the components'* — is what SDD-42
  // widened. An app whose components bring no rule of their own and that leans entirely on
  // the project's guide used to emit the sheet and have no browser without native support
  // adopt it.
  if (!hasStyles && !hasProjectStyles) return;
  w.line('// The style-adoption polyfill (SDD-18 §5) goes in <head>, live BEFORE the body streams,');
  w.line('// so its observer adopts each host sheet as it arrives; the style modules follow it.');
  w.line("head += '<script' + $nonce + '>' + STYLE_POLYFILL + '</script>';");
  // The project's guide FIRST, and the order is contract twice over. It is the cascade —
  // the guide defines, the component adjusts (SDD-42 §4.1) — and it is rule 2 of SDD-18
  // §3.2: a module has to be in the module map BEFORE the `<template>` that names it is
  // parsed, and every template that adopts the guide is below this line.
  if (hasProjectStyles) {
    w.line(
      "head += PROJECT_STYLES.map(function (s) { return '<style type=\"module\"' + $nonce + ' specifier=\"' + s.specifier + '\">' + s.css + '</style>'; }).join('');",
    );
  }
  // The style modules carry the nonce too, and the reason is `type="module"`. Under Chrome's
  // experimental web features a `<style type="module">` is no longer only a style: it is
  // checked against `script-src`, and without a nonce a strict policy refuses it — one
  // console error per styled component of the page, and the sheets never register.
  //
  // It costs ~30 bytes per component and is inert everywhere else: a browser that treats the
  // element as a plain `<style>` ignores the attribute, and `style-src` never asked for it.
  w.line(
    "head += COMPONENTS.map(function (c) { return '<style type=\"module\"' + $nonce + ' specifier=\"' + c.tag + '\">' + c.css + '</style>'; }).join('');",
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
    /**
     * What the `fudic:runtime` marker becomes here (BUG-31 §T1). A whole page writes the tags
     * (`writeRuntimeTags`); a layout writes a call to the route's `runtime()` slot, because
     * whether THIS page hydrates is the route's fact and a layout is shared by many.
     *
     * Absent means no marker is honoured: a head that is only a contribution has nowhere to
     * put a runtime.
     */
    readonly onRuntime?: () => void;
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
    if (options.onRuntime !== undefined && isRuntimeMarker(child)) {
      options.onRuntime();
    } else if (child.name === 'title') {
      w.line(`head += '<title>' + (${titleExpr(source, child)}) + '</title>';`);
    } else {
      w.line(`head += ${headElementExpr(source, child, options.linker)};`);
    }
  }
  // A layout whose `@RenderHead()` sits deeper than a direct child of `<head>` (or none at
  // all, FUD0425): the route's contributions still go out, at the end of the head.
  if (!injected && options.onInject !== undefined) options.onInject();
}

/**
 * The author's own `@code`, as the RENDER module of a route or a page carries it
 * (SDD-39 §4.1).
 *
 * Two zones and two shapes, and both are the component's, applied to an entry that until
 * now wrote neither:
 *
 * - the **inert reactive**, a function whose call returns the initial value. The server does
 *   not evaluate the body of `@client`, so `@count()` in the markup of a route used to be a
 *   `ReferenceError` that killed the whole prerender (§1.1). It is the same mechanism SDD-31
 *   §4.6 already gives a component, written here for the entry.
 * - the **neutral zone**, verbatim and in source order, because it is the half that runs on
 *   both sides — it is where a form is imported and where a helper the markup calls lives.
 *
 * `mappedLine` and not `line`: this is the author's own code, and the anchor is what lets a
 * breakpoint in the `.fud` find it. An `import` is not here at all — it is only legal at
 * module scope, so the caller hoists it.
 *
 * A statement that REGISTERS is skipped, and here the reason is not the component's. A
 * component writes its `provide` in full on this side because it OWNS a container to register
 * into (`$own`, SDD-38 §4.5); a route owns none — it opens the root and hands it down, and
 * resolves through `ctx.inject(…)` (SDD-38 §6.24). Writing the line here would name a
 * container that does not exist. Providers in a route are not this SDD's, and dropping them
 * is exactly what happened before, when no part of a route's `@code` was emitted at all.
 */
export function writeEntryCode(w: CodeWriter, code: ExtractedCode): void {
  for (const s of code.signals) {
    const init = s.kind === 'computed' ? `(${s.init})` : `() => (${s.init})`;
    w.line(`const ${s.name} = ${init}; // inert ${s.kind} (SSR; hydration is client-side)`);
  }
  for (const statement of code.neutral) {
    if (statement.hoisted || statement.provides) continue;
    w.mappedLine({ text: statement.text, src: statement.at, anchors: statement.anchors });
  }
}

/** The `import` lines of a `@code`'s neutral zone, hoisted to module scope (decision 33.c). */
export function writeEntryImports(w: CodeWriter, code: ExtractedCode): void {
  for (const statement of code.neutral) {
    if (!statement.hoisted) continue;
    w.mappedLine({ text: statement.text, src: statement.at, anchors: statement.anchors });
  }
}
