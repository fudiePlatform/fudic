/**
 * The virtual host page (§4.2, §4.10): the one generator behind `mount` with `via: 'ssr'` and
 * `renderSnippet`.
 *
 * A component's own `render` does not paint what the server sends for it. Its host — whether
 * it is claimed for hydration, the sheets it adopts, the options of its shadow root — is
 * written by whoever instantiates it, and the maps hydration reads and the sheets it adopts
 * are written by the page. So the harness never assembles that HTML: it writes a page that
 * instantiates what is under test, and lets the compiler emit the rest.
 */

/** A `<link>` of the host page. */
export interface HostLink {
  readonly rel: 'component' | 'snippet';
  /** Absolute path of the linked `.fud`. */
  readonly href: string;
}

export interface HostInput {
  readonly links: readonly HostLink[];
  /** The body of the page's `@code`, when it declares anything. */
  readonly code?: string;
  /** The page's markup. */
  readonly body: string;
}

/** `html` as `.fud` text that paints it verbatim: every `@` escaped as `@@`. */
export function verbatim(html: string): string {
  return html.replaceAll('@', '@@');
}

/** A forward-slashed path, as a `<link href>` takes it. */
const hrefOf = (path: string): string => path.replace(/\\/gu, '/');

export interface LayoutHostInput {
  /** Absolute path of the layout. */
  readonly layout: string;
  readonly head: string | undefined;
  readonly body: string | undefined;
  readonly sections: Readonly<Record<string, string>> | undefined;
}

/**
 * The source of a route that does nothing but use `layout` (§3.8): what it contributes to the
 * head, its sections and its body, written verbatim. The props are not the route's to write: the
 * harness hands them to the render already resolved, as the Service Worker is handed them.
 */
export function layoutHost(input: LayoutHostInput): string {
  const head = input.head === undefined ? '' : `<head>\n${verbatim(input.head)}\n</head>\n`;
  const sections = Object.entries(input.sections ?? {}).map(
    ([name, html]) => `@section ${name} {\n${verbatim(html)}\n}\n`,
  );
  return `<link rel="layout" href="${hrefOf(input.layout)}">\n${head}${sections.join('')}${verbatim(input.body ?? '')}\n`;
}

export interface SnippetHostInput {
  /** The host component's own tag. */
  readonly tag: string;
  /** Absolute path of the snippet file. */
  readonly file: string;
  /** What follows `@render`, in `.fud` syntax. */
  readonly call: string;
  /** The values the call reads by name, written as literals. */
  readonly scope: Readonly<Record<string, unknown>>;
}

/**
 * The source of the component that renders one snippet (§4.10): it links the snippet file,
 * declares each value of `scope` in its `@code`, and renders the call in its shadow root.
 */
export function snippetHost(input: SnippetHostInput): string {
  const scope = Object.entries(input.scope).map(([name, value]) => `const ${name} = ${JSON.stringify(value)};\n`);
  const code = scope.length === 0 ? '' : `@code {\n${scope.join('')}}\n`;
  return (
    `<link rel="snippet" href="${hrefOf(input.file)}">\n${code}` +
    `<${input.tag}>\n<template shadowrootmode="open">\n@render ${input.call}\n</template>\n</${input.tag}>\n`
  );
}

/** The name the host layout is cached under, before its hash. */
export const HOST_LAYOUT_NAME = '_host-layout';

/**
 * The layout every host page links (SDD-88): the smallest document there is, so the body of a
 * host page paints exactly what the page puts in it. Its `<html>` carries the project's
 * language, as the layouts `fudic g` writes do (SDD-71).
 */
export function hostLayout(lang: string): string {
  return `<!DOCTYPE html>\n<html lang="${lang}">\n<head>\n<meta charset="utf-8">\n<script type="module" src="fudic:runtime"></script>\n@RenderHead()\n</head>\n<body>\n@RenderBody()\n</body>\n</html>\n`;
}

/**
 * The source of the host page: a route that links the host layout `layout` — a file name beside
 * it in the cache — so the compiler emits it as a page — head, body and the hydration maps — and
 * not as a component. Every page links a layout (SDD-88), the harness's own too.
 */
export function hostPage(input: HostInput, layout: string): string {
  const links = input.links.map((link) => `<link rel="${link.rel}" href="${hrefOf(link.href)}">\n`);
  const code = input.code === undefined ? '' : `@code {\n${input.code}\n}\n`;
  return `<link rel="layout" href="./${layout}">\n${links.join('')}${code}${input.body}\n`;
}
