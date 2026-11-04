/** A HistoryIo in memory, with a fixed clock and commit: what the tests write lands in `files`. */

import { posix } from 'node:path';
import type { CheckFs } from '@fudic/typecheck';
import type { HistoryIo } from '../src/io.js';

export interface MemoryIo extends HistoryIo {
  readonly files: Map<string, string>;
  /** The text of a file, by its path relative to the root. */
  text(path: string): string | undefined;
  /** Moves the clock. */
  at(iso: string): void;
}

export const ROOT = '/project';

const unused = (): never => {
  throw new Error('not used by the history');
};

export function memoryIo(
  options: { readonly now?: string; readonly head?: string; readonly files?: Record<string, string> } = {},
): MemoryIo {
  const files = new Map<string, string>(
    Object.entries(options.files ?? {}).map(([path, text]) => [posix.join(ROOT, path), text]),
  );
  const fs: CheckFs = {
    fudFiles: unused,
    readFile: (path) => files.get(path),
    resolveHref: (from, href) => posix.join(posix.dirname(from), href),
    hrefFailure: () => undefined,
    realPath: (path) => path,
  };
  let now = new Date(options.now ?? '2026-10-22T10:02:41.123Z');
  return {
    root: ROOT,
    fs,
    files,
    append: (path, text) => {
      files.set(path, `${files.get(path) ?? ''}${text}`);
      return Promise.resolve();
    },
    now: () => now,
    head: () => Promise.resolve(options.head),
    text: (path) => files.get(posix.join(ROOT, path)),
    at: (iso) => {
      now = new Date(iso);
    },
  };
}
