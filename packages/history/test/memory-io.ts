/** A HistoryIo in memory, with a fixed clock and commit: what the tests write lands in `files`. */

import { resolve } from 'node:path';
import type { HistoryIo } from '../src/io.js';

export interface MemoryIo extends HistoryIo {
  readonly files: Map<string, string>;
  /** The text of a file, by its path relative to the root. */
  text(path: string): string | undefined;
  /** Moves the clock. */
  at(iso: string): void;
}

export const ROOT = resolve('/project');

export function memoryIo(
  options: { readonly now?: string; readonly head?: string; readonly files?: Record<string, string> } = {},
): MemoryIo {
  const files = new Map<string, string>(
    Object.entries(options.files ?? {}).map(([path, text]) => [resolve(ROOT, path), text]),
  );
  let now = new Date(options.now ?? '2026-10-22T10:02:41.123Z');
  return {
    root: ROOT,
    files,
    read: (path) => Promise.resolve(files.get(path)),
    append: (path, text) => {
      files.set(path, `${files.get(path) ?? ''}${text}`);
      return Promise.resolve();
    },
    now: () => now,
    head: () => Promise.resolve(options.head),
    text: (path) => files.get(resolve(ROOT, path)),
    at: (iso) => {
      now = new Date(iso);
    },
  };
}
