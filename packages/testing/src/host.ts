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

/**
 * The source of the host page: a standalone page document, so the compiler emits it as a
 * page — head, body and the hydration maps — and not as a component.
 */
export function hostPage(input: HostInput): string {
  const links = input.links.map((link) => `<link rel="${link.rel}" href="${link.href.replace(/\\/gu, '/')}">\n`);
  const code = input.code === undefined ? '' : `@code {\n${input.code}\n}\n`;
  return `<!DOCTYPE html>\n<html>\n<head>\n${links.join('')}${code}</head>\n<body>\n${input.body}\n</body>\n</html>\n`;
}
