/**
 * What the workbench knows of the terms' runtime: the extensions it is given, already loaded, and
 * the host it hands them. It never builds a term's `ctx` itself: the extensions do, in order, each
 * from the one before.
 */

import type { Locator, Page } from 'playwright-core';
import type { Box } from './protocol.js';

/** What the workbench gives the runtime: the page and where to report. */
export interface TermHost {
  readonly page: Page;
  /** Runs a gesture and waits for the page to serve it. */
  settle<T>(target: Locator, gesture: () => Promise<T>): Promise<T>;
  /** For the shot: where each resolved reference was. */
  onLocate(ref: string, box: Box): void;
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

/** An extension's error, as the criterion reports it. */
function failure(file: string, error: unknown): Error {
  return new Error(`${file}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
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
