/**
 * Chunk file name → chunk NAME (SDD-27 §5.4).
 *
 * The `link` pass hands back file names (`sw/c/app-badge-BtWdjIM9.js`); the manifest
 * states names (`app-badge`), because the directory and the hash are derivable and the
 * name is not. This is the one place that strips one down to the other, and it is the
 * inverse of what Rollup composed from the chunk's `name` plus its hash.
 */

import { BUILD_ID_LENGTH } from './constants.js';

/** A Rollup hash and the build id measure the same, which is what makes §5.2 possible. */
const HASH_LENGTH = BUILD_ID_LENGTH;

/**
 * `sw/c/blog-slug-N9OIQ_Kf.js` → `blog-slug`.
 *
 * The split is by WIDTH, not by the last `-`: Rollup's hash alphabet is base64url, so a
 * hash contains `-` and `_` as readily as a name does (`site-nav-Bq-vwUs5.js` is
 * `site-nav` + `Bq-vwUs5`). Splitting on the last separator produced `site-nav-Bq`, and
 * the derived URL then pointed at a file that was never written. The last `-` plus eight
 * characters before `.js` is the hash; there is exactly one such split.
 *
 * Returns `null` for anything that is not a hashed chunk file name, so the caller decides
 * rather than receiving a mangled name.
 */
export function chunkNameOf(fileName: string): string | null {
  const match = new RegExp(`^(?:.*/)?(.+)-.{${String(HASH_LENGTH)}}\\.js$`, 'u').exec(fileName);
  return match?.[1] ?? null;
}

/** The same, over a topologically ordered list; unrecognized entries are dropped. */
export function chunkNamesOf(fileNames: readonly string[]): readonly string[] {
  const names: string[] = [];
  for (const fileName of fileNames) {
    const name = chunkNameOf(fileName);
    if (name !== null) {
      names.push(name);
    }
  }
  return names;
}
