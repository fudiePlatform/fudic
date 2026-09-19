/**
 * The host filesystem, injected (SDD-15 §3).
 *
 * The compiler never touches `node:fs` or `node:path`: it is a library the Vite plugin, the
 * CLI and the language server each drive with their own I/O, and two of those three do not
 * have a filesystem at all in the sense the third means. Every pass that follows a `href` —
 * the component graph, the layout chain, the snippet scope — takes this and nothing else.
 *
 * It lives in `types/` rather than beside its first caller because it now has several, and
 * the one that came second cannot import the one that came first without a cycle.
 */
export interface ResolveIo {
  /** Read a `.fud` file's text by absolute path. */
  read(path: string): string;
  /**
   * Resolve an `href` written in `fromPath`.
   *
   * Relative (`./x.fud`, `../y.fud`) resolves against the file, as it always did. A BARE
   * specifier (`@acme/ui/card.fud`, `ui-kit/card.fud`) resolves as a package specifier from
   * that file's directory — the same algorithm an `import` would use, so the answer agrees
   * with what the bundler, `node` and the editor each already believe (SDD-43 §3.1).
   */
  resolve(fromPath: string, href: string): string;
}
