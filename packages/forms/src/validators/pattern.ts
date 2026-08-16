/**
 * `pattern` — the value matches.
 *
 * The expression is rebuilt without the global flag at factory time rather than
 * used as given: a `/g` regexp keeps `lastIndex` between calls, so the same value
 * would pass and fail alternately. Rebuilding once is cheaper than resetting on
 * every keystroke, and it cannot be forgotten.
 */

import type { Validator } from '../types.js';

export const pattern = (re: RegExp): Validator<string | null> => {
  const safe = re.flags.includes('g') ? new RegExp(re.source, re.flags.replace(/g/g, '')) : re;
  return (v) => (v !== null && v !== '' && !safe.test(v) ? { pattern: safe.source } : null);
};
