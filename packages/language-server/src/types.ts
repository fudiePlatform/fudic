/**
 * Public contracts of the server (SDD-24 §3.3) and the ports it depends on.
 *
 * Types only, no behaviour: the workspace index, the services and the tests all depend on
 * these shapes without depending on each other. The two ports exist so that no module of
 * the domain imports `node:fs` — the server is one process serving many folders, and the
 * tests drive it over a filesystem they control.
 */

/** What the client sends in `initialize` (§3.3). Arrives as `unknown`; see `resolveOptions`. */
export interface FudicInitializationOptions {
  readonly typescript: { readonly tsdk: string };
  readonly fudic?: FudicUserOptions;
}

/** The `fudic` half of the initialization options, all optional. */
export interface FudicUserOptions {
  /** Template diagnostics against the types. Default true. */
  readonly templateDiagnostics?: boolean;
  /** Dump of the virtuals for debugging. Default false. */
  readonly exposeVirtualFiles?: boolean;
}

/**
 * The options once the defaults are applied — what every module downstream reads.
 *
 * Separate from `FudicInitializationOptions` on purpose: an absent field is a question the
 * client left open, and answering it once, here, keeps `?? true` out of a dozen call sites.
 */
export interface FudicOptions {
  /** Path to the project's TypeScript. Empty when the client sent none (§6.1 degrades). */
  readonly tsdk: string;
  readonly templateDiagnostics: boolean;
  readonly exposeVirtualFiles: boolean;
}

/**
 * The filesystem, narrowed to what the workspace index needs (§4.5).
 *
 * A port, not `node:fs`: the index is scanned once at start-up and maintained by watchers,
 * so the only I/O in the whole server lives behind this interface — and a test can hand it
 * a folder that never touched a disk.
 */
export interface FileSystemScanner {
  /** Every `.fud` under `root`, as absolute paths. Empty when `root` does not exist. */
  fudFiles(root: string): readonly string[];
  /** File contents, or `undefined` when it cannot be read. Never throws. */
  readFile(path: string): string | undefined;
}

/**
 * The trace channel (§5). Every swallowed exception ends up here.
 *
 * A dead server leaves the file with no colour and no errors; the price of never throwing
 * is that the reason has to be written down somewhere.
 */
export interface Logger {
  info(message: string): void;
  error(message: string, cause?: unknown): void;
}
