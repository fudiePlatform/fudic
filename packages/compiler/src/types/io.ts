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
import type { OffsetMap } from '../expand/offsets.js';

export interface ResolveIo extends ApiIo {
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
  /**
   * When `read` returns a REWRITTEN text — the file compiled for one locale (SDD-58 §4.6) — the
   * text on disk and the map from the one to the other. Absent, or `undefined` for a file, and
   * what `read` returned is what is on disk.
   */
  origin?(path: string): { readonly source: string; readonly map: OffsetMap } | undefined;
}

/**
 * What the compiler needs to know about a linked `.fudapi` (SDD-60 §3.14), answered by the host.
 *
 * The compiler does not read contracts: it stays free of `@fudic/api` as it is free of the
 * filesystem. The host parses the file and hands over its facts. Structural, so a host may
 * build it from anything.
 */
export interface LinkedApi {
  /** `<id>` of the file: `routes/usuarios`. Its module is `fudic:<id>`. */
  readonly id: string;
  /** It declares `load` (and so gives the page its `data`). */
  readonly load: boolean;
  readonly paths: boolean;
  readonly layout: boolean;
  /** The names of its functions. */
  readonly functions: readonly string[];
  /** Its own forms, and the forms its functions take: the names the view gets. */
  readonly forms: readonly string[];
  /** The `.fud` it is the sibling of, when it sits next to a route; absolute. */
  readonly route?: string;
}

export interface ApiIo {
  /**
   * The facts of the `.fudapi` at `path`, or `undefined` when there is none. A host without
   * the method cannot know, and every rule that would need it stays silent.
   */
  api?(path: string): LinkedApi | undefined;
}
