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

/**
 * The source of the host page: a standalone page document, so the compiler emits it as a
 * page — head, body and the hydration maps — and not as a component.
 */
export function hostPage(input: HostInput): string {
  const links = input.links.map((link) => `<link rel="${link.rel}" href="${hrefOf(link.href)}">\n`);
  const code = input.code === undefined ? '' : `@code {\n${input.code}\n}\n`;
  return `<!DOCTYPE html>\n<html>\n<head>\n${links.join('')}${code}</head>\n<body>\n${input.body}\n</body>\n</html>\n`;
}
