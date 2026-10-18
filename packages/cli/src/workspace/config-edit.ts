/**
 * An edit of a project's `fudic.json` (BUG-50 §4.6, §4.7): `globalStyles` from `g style`,
 * `locales` from `add i18n`. The file is small and the CLI wrote it, so it is rewritten whole,
 * keys in the order they were, two spaces as `fudic new` writes them.
 */

import { CONFIG_FILE } from '@fudic/config';
import { joinPosix } from '../paths.js';
import type { ReadIo } from '../io.js';
import type { FileChange } from '../types.js';
import type { Target } from './target.js';

/** The `fudic.json` of `target` as an object. It read, or `resolveTarget` would have failed. */
export function readConfigObject(target: Target, io: ReadIo): Record<string, unknown> {
  return JSON.parse(io.read(joinPosix(target.path, CONFIG_FILE))) as Record<string, unknown>;
}

/** The change that writes `next` as the `fudic.json` of `target`. */
export function configChange(target: Target, next: Readonly<Record<string, unknown>>, io: ReadIo): FileChange {
  const before = io.read(joinPosix(target.path, CONFIG_FILE));
  return { kind: 'modify', path: joinPosix(target.dir, CONFIG_FILE), contents: `${JSON.stringify(next, null, 2)}\n`, before };
}
