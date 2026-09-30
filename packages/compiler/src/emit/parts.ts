/**
 * Emit pieces shared by the four document roles. They live here — and not in `module.ts` —
 * because SDD-21 made every one of them have two callers: a page and a layout both write a
 * `<head>`, a page and a route both interpolate a `<title>`, a component module and a layout
 * module both import their children by tag.
 *
 * Text only, like the rest of the emit: no runtime is imported and no filesystem is touched.
 */

import type { ElementNode, HtmlContent } from '../html/index.js';
import { isComponentLink, isLayoutLink, isSnippetLink } from '../document/index.js';
import type { Span } from '../types/index.js';
import type { ComponentGraph, ResolvedComponent, ResolvedLayout } from './resolve.js';
import type { CodeWriter } from './writer.js';
import { AssetLinker } from './assets.js';
import { isAssetAttr } from './markup.js';
import { compactProjectCss } from './project-styles.js';
import { isLiteralText, literalText } from './runs.js';
import type { ExtractedCode } from './oxc-code.js';
import { NO_SIGNALS, writeElementAttrs } from './attrs.js';

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
 * A `<link rel="stylesheet" href="…?inline">` as the sheet itself, or `null` when this
 * element is not that (SDD-45 §3.6).
 *
 * A stylesheet and nothing else, deliberately. `?inline` is a general instruction — put this
 * resource in the page — but a document has exactly one kind of resource whose embedding is
 * free of consequences: CSS, which is text and which the page was going to apply anyway. An
 * icon or an image embedded as a data URI grows the HTML of EVERY page by a third of the
 * file, and that is a different trade with a different answer. It stays a URL, and the query
 * travels to the bundler, which has its own meaning for it.
 */
function inlineStyleExpr(el: ElementNode, linker: AssetLinker): string | null {
  if (el.name !== 'link') return null;
  if (literalAttr(el, 'rel') !== 'stylesheet') return null;
  const href = literalAttr(el, 'href');
  if (href === null || !asksInline(href)) return null;
  const css = linker.textOf(href);
  if (css === null) return null;
  return `'<style' + $nonce + '>' + ${linker.cssTemplate(compactProjectCss(css))} + '</style>'`;
}

/**
 * The `href` of a `<link rel="stylesheet">` this build can prune, or `null` (SDD-49 §4.1).
 *
 * Only what the compiler can READ: a relative `href`, written literally, whose text the host
 * hands over. A root-absolute URL, another origin, an interpolated `href` or a file nobody can
 * read stays exactly as the author wrote it. The layout and the route ask this same question
 * about the same element, so they cannot disagree about which ones the route delivers.
 *
 * `resolve` turns the `href` into the specifier `linker` understands: the route reads its
 * layout's sheets through its own linker, relative to its own directory.
 */
export function prunableHref(
  el: ElementNode,
  linker: AssetLinker,
  resolve: (href: string) => string = (href) => href,
): string | null {
  if (el.name !== 'link' || literalAttr(el, 'rel') !== 'stylesheet') return null;
  if (interpolatesAttrs(el)) return null;
  const href = literalAttr(el, 'href');
  if (href === null || href.startsWith('/')) return null;
  return linker.textOf(resolve(href)) === null ? null : href;
}

/**
 * The key under which a route hands its layout each prunable sheet of that layout's `<head>`
 * (SDD-49 §4.6): the layout's depth — how many layouts it has above it, which does not depend
 * on the route — and the sheet's position among the prunable ones of that head.
 */
export function sheetKey(depth: number, ordinal: number): string {
  return `${depth}:${ordinal}`;
}

/**
 * The `<link>` element as the author wrote it, with its `href` replaced by `url` — a JS
 * expression. Every other attribute (`media`, `crossorigin`, …) travels untouched.
 */
export function linkWithHref(source: string, el: ElementNode, url: string): string {
  const href = el.attributes.find((a) => a.name === 'href')!;
  const first = href.value[0]!;
  const last = href.value[href.value.length - 1]!;
  return (
    JSON.stringify(source.slice(el.span.start, first.span.start)) +
    ` + ${url} + ` +
    JSON.stringify(source.slice(last.span.end, el.span.end))
  );
}

/**
 * Whether this `<head>` embeds a resource, and therefore needs the response's nonce.
 *
 * Asked by a LAYOUT, which writes no inline anything of its own and so has never declared
 * the binding: the polyfill and the style modules are the route's contribution, written into
 * the route's module where `$nonce` already lives. A layout that embeds a sheet is the first
 * thing to put an inline element in the layout's own head (SDD-45 §3.6).
 */
export function headEmbedsAsset(head: ElementNode, linker: AssetLinker): boolean {
  return head.children.some(
    (child) => child.type === 'element' && inlineStyleExpr(child, linker) !== null,
  );
}

/**
 * A page `<head>` element as a JS string expression: its verbatim source, with a static,
 * relative asset URL (`<link href>`, `<script src>`) spliced out and replaced by the import
 * binding Vite resolves and hashes (SDD-19 §4.5). Without a linkable URL this is just the
 * quoted source slice.
 *
 * Only for an element whose attributes carry no `@`: one that does is written by
 * `writeOpenTag`, and `writeHeadElements` tells the two apart before calling either.
 */
export function headElementExpr(source: string, el: ElementNode, linker: AssetLinker): string {
  // A stylesheet the author asked to embed (SDD-45 §3.6). It becomes the sheet itself, with
  // the nonce every other inline thing this emit writes carries, and no request is made for
  // it — the import is never registered, so the build publishes no file either.
  //
  // It goes through the SAME two passes a component's `<style>` does — compacted, and its
  // `url(…)` linked — because a second path for CSS is how one of two outputs stops being
  // minified without anybody noticing, which is the defect BUG-08 fixed.
  const inlined = inlineStyleExpr(el, linker);
  if (inlined !== null) return inlined;
  for (const attr of el.attributes) {
    if (typeof attr.name !== 'string' || !isAssetAttr(el.name, attr.name)) continue;
    const parts = attr.value;
    const first = parts[0];
    const last = parts[parts.length - 1];
    if (parts.length === 0 || first === undefined || last === undefined) continue;
    // Every part is text: an element whose attributes carry a `@` never gets here, it goes
    // through `writeOpenTag` instead (BUG-44).
    // `'head'`: this is a document's own head, so what it links is what every page needs to
    // render itself — the shell, by definition rather than by media type.
    const binding = linker.maybeRef(
      parts.map((p) => (p as { value: string }).value).join(''),
      'head',
    );
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
 * The query that puts a resource INSIDE the page instead of leaving it at a URL
 * (SDD-45 §3.6).
 *
 * It is one query and it means one thing wherever it appears: `fudic:runtime?inline` embeds
 * the coordinator, `href="./tokens.css?inline"` embeds that stylesheet. It never substitutes
 * one thing for another — what the author wrote is still what comes out, only carried by the
 * document rather than fetched from it.
 *
 * **The decision is the developer's and not the framework's**, which is why it is written in
 * the layout: a strict security policy and a slow connection ask for opposite things, and
 * only the person deploying knows which of the two they have. The default is the file: it is
 * what works under the strictest policy and what is cached between navigations.
 */
export const INLINE_QUERY = 'inline';

/** Whether a specifier asks to be embedded: `…?inline`, alone or among other queries. */
export function asksInline(spec: string): boolean {
  const q = spec.indexOf('?');
  if (q === -1) return false;
  return new URLSearchParams(spec.slice(q + 1)).has(INLINE_QUERY);
}

/** How the runtime is carried into the page: as a file, or inside the document (§3.6). */
export type RuntimeForm = 'file' | 'inline';

/**
 * A `<link>` that names the component, layout or snippet graph: never output, in any role.
 *
 * All three are consumed at compile time and none of them is a stylesheet, a preload or
 * anything a browser would know what to do with. Left in the head they would also reach the
 * asset linker, which would publish the `.fud` they name — source and all — into the page.
 */
const isFrameworkLink = (el: ElementNode): boolean =>
  isComponentLink(el) || isLayoutLink(el) || isSnippetLink(el);

/**
 * Where a `<head>` asks for the runtime to be carried IN the document, or `null` (§3.6).
 *
 * A fact about the source, reported rather than acted on: whether that is allowed depends on
 * the security policy the application ships, and a compiler with no filesystem has never
 * seen it. The host asks this question and raises `FUD0803` — the same split that already
 * governs a missing asset, where the emit collects and the plugin reports.
 */
export function inlineRuntimeMarker(head: ElementNode): Span | null {
  for (const child of head.children) {
    if (child.type !== 'element') continue;
    if (runtimeMarkerForm(child) === 'inline') return child.span;
  }
  return null;
}

/** The sink an opening tag is written into, one `$open` per block. */
const OPEN = '$open';

/**
 * An opening tag through the SAME attribute machinery every element of the body uses
 * (SDD-40 §4.4): decision 21's omitted nullish attribute, the `class:` composition, the asset
 * linker, and the serializer's escaping — `io.escapeAttr`, which every role has in scope.
 *
 * `writeElementAttrs` writes `$dom.setAttr(…)`, so the sink is a `$dom` of one method in a
 * block of its own; what it leaves is `$open`, the tag up to and including its `>`.
 */
export function writeOpenTag(w: CodeWriter, source: string, el: ElementNode, linker: AssetLinker): void {
  w.line(`let ${OPEN} = '<${el.name}';`);
  w.line('{');
  w.indent();
  w.line(
    `const $dom = { setAttr: ($t, $k, $v) => { ${OPEN} += ' ' + $k + '="' + io.escapeAttr(String($v)) + '"'; } };`,
  );
  w.line('const $el = null;');
  writeElementAttrs(source, el, '$el', w, linker, NO_SIGNALS);
  w.dedent();
  w.line('}');
  w.line(`${OPEN} += '>';`);
}

/**
 * A head element whose attributes carry a `@`: `<meta property="article:section"
 * content="@seccion">` in a layout, `<meta name="description" content="@data.summary">` in a
 * route or a page (BUG-44).
 *
 * The head was written verbatim, `<title>` aside, so the `@` reached the browser as text. Its
 * opening tag goes through `writeOpenTag`, in a block of its own so each element's `$open` is
 * its own; what follows the tag — nothing, for a `<meta>` — is the source as written.
 */
function writeInterpolatedHeadElement(
  w: CodeWriter,
  source: string,
  el: ElementNode,
  linker: AssetLinker,
): void {
  w.line('{');
  w.indent();
  writeOpenTag(w, source, el, linker);
  w.line(`head += ${OPEN} + ${JSON.stringify(source.slice(el.openSpan.end, el.span.end))};`);
  w.dedent();
  w.line('}');
}

/** Whether the value of any attribute of `el` carries a `@`. */
function interpolatesAttrs(el: ElementNode): boolean {
  return el.attributes.some((a) => a.value.some((p) => p.type === 'razor-expression'));
}

/** The literal text of an attribute, or `null` when it is interpolated. */
function literalAttr(el: ElementNode, name: string): string | null {
  for (const a of el.attributes) {
    if (a.name !== name) continue;
    if (!a.value.every((p) => p.type === 'attribute-text')) return null;
    return a.value.map((p) => (p as { value: string }).value).join('');
  }
  return null;
}

/**
 * Which form of the marker this head element is, or `null` when it is not one.
 *
 * A `<script>` whose `src` is literally `fudic:runtime`, with or without `?inline`. An
 * interpolated `src` is not a marker — a marker is a constant by definition — and neither is
 * `fudic:runtimeish` or a marker with any other query: an unknown query is a typo, and
 * answering it as if it were the default is how a page ends up silently not inlining.
 */
function runtimeMarkerForm(el: ElementNode): RuntimeForm | null {
  if (el.name !== 'script') return null;
  const src = literalAttr(el, 'src');
  if (src === null) return null;
  if (src === RUNTIME_MARKER) return 'file';
  if (src === `${RUNTIME_MARKER}?${INLINE_QUERY}`) return 'inline';
  return null;
}

/**
 * What the marker becomes.
 *
 * `boot` rides every page: fudic is offline-first, so the Service Worker is registered
 * whether or not this page has a line of JavaScript of its own. The coordinator — the module
 * that names this route's pieces — rides only a page that has something to hydrate.
 *
 * **Neither entry is preloaded, and the PIECES are** (SDD-45 §4.5). A `<link
 * rel="modulepreload">` for a file whose `<script>` is on the next line buys nothing — the
 * tag already started the fetch — and under the Service Worker the two requests land in
 * different worlds and do not match, which the browser reports as an unused preload. What
 * earns a preload is what the coordinator IMPORTS, because the browser cannot discover those
 * until it has parsed it: that is the chain of §1.5 rule 2, one round trip deep, and it is
 * now removable. This comment used to say those names «are a fact of the bundle and do not
 * reach this side»; they do now, because the same plugin that writes this head decides the
 * URLs of the pieces.
 *
 * With `?inline` there are no preloads and none are needed: the coordinator's own `import`s
 * are read with the HTML, which is the earliest instant there is.
 *
 * `io.runtime` is absent in a standalone render (a golden, `renderToString`), and then the
 * marker produces nothing at all: there is no build, so there are no URLs to write.
 */
export function writeRuntimeTags(w: CodeWriter, hydrates: boolean, form: RuntimeForm): void {
  w.line('if (io.runtime !== undefined) {');
  w.indent();
  // Empty means this project has no Service Worker, and then there is no tag either
  // (SDD-45 §4.11). The condition is the one that already decided the module's CONTENT,
  // moved one step earlier: a page used to ask for a file whose whole body was `export {};`.
  w.line("if (io.runtime.boot !== '') {");
  w.indent();
  w.line(
    "head += '<script type=\"module\" src=\"' + io.runtime.boot + '\"></script>';",
  );
  w.dedent();
  w.line('}');
  if (hydrates && form === 'file') {
    // One `<link>` per piece THIS route names, so the browser opens every connection while
    // it is still reading the head instead of discovering them inside the coordinator.
    w.line(
      "head += io.runtime.pieces.map(function (u) { return '<link rel=\"modulepreload\" href=\"' + u + '\">'; }).join('');",
    );
    w.line("head += '<script type=\"module\" src=\"' + io.runtime.main + '\"></script>';");
  }
  if (hydrates && form === 'inline') {
    // The nonce, because an inline module is exactly what a strict `script-src` refuses
    // without one (`FUD0803` is the build saying so before a browser does).
    //
    // And the file when there is nothing to embed: in dev nothing is built, so there is no
    // coordinator to carry, and the dev server serves it at its own URL. That is §4.15 —
    // development does not change — and not a silent fallback: a build always has the source.
    w.line("if (io.runtime.inline !== '') {");
    w.indent();
    w.line(
      "head += '<script type=\"module\"' + $nonce + '>' + io.runtime.inline + '</script>';",
    );
    w.dedent();
    w.line('} else {');
    w.indent();
    w.line("head += '<script type=\"module\" src=\"' + io.runtime.main + '\"></script>';");
    w.dedent();
    w.line('}');
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
 * except `<title>`, whose text is interpolated, an element whose attributes carry a `@`, which
 * goes through the attribute machinery (BUG-44), and the framework links, which are the
 * component / layout graph and never output.
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
     *
     * It receives the FORM the author asked for (SDD-45 §3.6), because that is the one half
     * of this decision that belongs to the layout: where the runtime goes and how it travels
     * are written in the same line. Whether there is any runtime at all remains the route's.
     */
    readonly onRuntime?: (form: RuntimeForm) => void;
    /**
     * What a prunable stylesheet becomes here (SDD-49 §4.6): a JS expression for its element,
     * or `null` for one this head writes as it always did. Absent — no pruning — and every
     * sheet is written as the author wrote it.
     */
    readonly sheet?: (el: ElementNode) => string | null;
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
    // A framework link is the component/layout graph and is never output — in ANY role.
    // The `skip` set says so for the one role that collects them into a field; this says it
    // for the rest, which is what stops a misplaced one (FUD0438) from being published as
    // an asset by a build that recovered from the error and carried on.
    if (isFrameworkLink(child)) continue;
    const pruned = options.sheet?.(child) ?? null;
    if (pruned !== null) {
      w.line(`head += ${pruned};`);
      continue;
    }
    const form = options.onRuntime === undefined ? null : runtimeMarkerForm(child);
    if (options.onRuntime !== undefined && form !== null) {
      options.onRuntime(form);
    } else if (child.name === 'title') {
      w.line(`head += '<title>' + (${titleExpr(source, child)}) + '</title>';`);
    } else if (interpolatesAttrs(child)) {
      writeInterpolatedHeadElement(w, source, child, options.linker);
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
