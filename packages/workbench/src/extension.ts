/**
 * What the workbench knows of the terms' runtime: the extensions it is given, already loaded, and
 * the host it hands them. It never builds a term's `ctx` itself: the extensions do, in order, each
 * from the one before.
 */

import type { Locator, Page } from 'playwright-core';
import type { Box } from './protocol.js';

/** The last response of a document, as the host reports it. */
export interface DocumentResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
}

/** What the workbench gives the runtime: the page, where to report, and what it knows of the criterion. */
export interface TermHost {
  readonly page: Page;
  /** Where the criterion opens, absolute. */
  readonly url: string;
  /** A path of the `.fudspec`, absolute: relative to its folder. */
  resolve(path: string): string;
  /** Resolves once the page is quiet (SDD-82 §4.5). */
  quiet(): Promise<void>;
  /** Stands the browsers' and the server's clocks at `at` (SDD-82 §4.6). */
  clock(at: number, label: string): Promise<void>;
  /** Moves both clocks `ms` forward; without a clock, waits for real. */
  advance(ms: number): Promise<void>;
  /** The calls of the criterion, in order (SDD-82 §4.4). */
  calls(): readonly { readonly name: string; readonly args: Readonly<Record<string, unknown>>; readonly faked: boolean; readonly status: number }[];
  /** The last response of a document in this browser; null when the last one got none. */
  response(): DocumentResponse | null;
  /** The requests and downloads of the last `when` block in this browser. */
  lastWhen(): { readonly requests: number; readonly downloads: readonly string[] };
  /** Whether the document is another than before the last `when` block. */
  reloaded(): Promise<boolean>;
  /** What the page's real `paths()` lists, as `path` writes it; null without one. */
  paths(): Promise<readonly string[] | null>;
  /** Runs a gesture and waits for the page to serve it. */
  settle<T>(target: Locator, gesture: () => Promise<T>): Promise<T>;
  /** For the shot: where each resolved reference was, and its `data-fud-src` (null without one). */
  onLocate(ref: string, box: Box, source: string | null): void;
}

/** An extension of the workbench: it prepares the page before the mount, and extends the ctx. */
export interface BenchExtension {
  setup?(page: Page): Promise<void>;
  context?(ctx: never, host: TermHost): unknown;
}

/** An extension and the file it came from: an error of it names the file. */
export interface LoadedExtension {
  readonly file: string;
  readonly extension: BenchExtension;
}

/** An extension threw: its message names the file, and `file` and `reason` say it as data. */
export class ExtensionError extends Error {
  constructor(
    readonly file: string,
    readonly reason: string,
    cause: unknown,
  ) {
    super(`${file}: ${reason}`, { cause });
  }
}

/** An extension's error, as the criterion reports it. */
function failure(file: string, error: unknown): Error {
  return new ExtensionError(file, error instanceof Error ? error.message : String(error), error);
}

/** Every `setup`, in order. */
export async function setUp(extensions: readonly LoadedExtension[], page: Page): Promise<void> {
  for (const { file, extension } of extensions) {
    try {
      await extension.setup?.(page);
    } catch (error) {
      throw failure(file, error);
    }
  }
}

/** The ctx the terms see: every `context`, in order, from an empty one. */
export function chainContext(extensions: readonly LoadedExtension[], host: TermHost): unknown {
  let ctx: unknown = {};
  for (const { file, extension } of extensions) {
    if (extension.context === undefined) continue;
    try {
      ctx = extension.context(ctx as never, host);
    } catch (error) {
      throw failure(file, error);
    }
  }
  return ctx;
}
