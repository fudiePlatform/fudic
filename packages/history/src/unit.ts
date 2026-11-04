import { isAbsolute, posix } from 'node:path';
import { toPosix } from '@fudic/typecheck';
import type { HistoryIo } from './io.js';

/** A piece's `.fud`, absolute and with `/`: given relative to the project root, or absolute. */
export const pathOf = (unit: string, io: HistoryIo): string => {
  const path = toPosix(unit);
  return isAbsolute(path) ? posix.normalize(path) : posix.join(io.root, path);
};

/** A path as the hashes and `unitState` write it: relative to the project root, with `/`. */
export const relativeTo = (io: HistoryIo, path: string): string => posix.relative(io.root, toPosix(path));

/** The piece's path without `.fud`: what its siblings are named from. */
export const stemOf = (path: string): string => path.replace(/\.fud$/u, '');
