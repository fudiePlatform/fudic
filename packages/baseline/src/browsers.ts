/**
 * A level in the words of Vite's `build.target` (SDD-83 §3.9): for each core browser, its last
 * release on the level's date or before. The Android browsers follow their desktop twins, and
 * esbuild's names are not the data's: `safari_ios` is `ios`.
 */

import { AS_OF, RELEASES } from './data.generated.js';
import { cutoff, type Target } from './level.js';

const NAMES = [
  ['chrome', 'chrome'],
  ['edge', 'edge'],
  ['firefox', 'firefox'],
  ['safari', 'safari'],
  ['safari_ios', 'ios'],
] as const;

/** `['chrome124', 'edge124', 'firefox125', 'safari17.4', 'ios17.4']` for `widely` with 3.45.0. */
export function browsersFor(target: Target, asOf: string = AS_OF): readonly string[] {
  const date = cutoff(target, asOf);
  return NAMES.flatMap(([browser, name]) => {
    const release = RELEASES[browser].findLast(([, released]) => released <= date);
    // A level older than the browser itself names no version of it.
    return release === undefined ? [] : [`${name}${release[0]}`];
  });
}
