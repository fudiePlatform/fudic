/**
 * What a web-features id is (SDD-83 §3.4): a feature with its name, or an id that moved or was split.
 * The ids are what `allow` names and what webstatus.dev shows. Apart from the judge, so reading a
 * `fudic.json` never loads the table of keys.
 */

import { FEATURES, REDIRECTS } from './data.generated.js';

/** A web-features id that is a feature. */
export interface FeatureInfo {
  readonly kind: 'feature';
  readonly id: string;
  /** Its name, as webstatus.dev shows it: `Popover`. */
  readonly name: string;
}

/** A web-features id that is no longer a feature: it moved to another id, or was split into several. */
export interface Moved {
  readonly kind: 'moved' | 'split';
  readonly id: string;
  /** Where it went: one id when it moved, several when it was split. */
  readonly to: readonly string[];
}

/** What a web-features id is: a feature, an id that moved or was split, or undefined. */
export function feature(id: string): FeatureInfo | Moved | undefined {
  if (Object.hasOwn(REDIRECTS, id)) {
    const [kind, ...to] = REDIRECTS[id] as readonly ['moved' | 'split', ...string[]];
    return { kind, id, to };
  }
  const found = FEATURES.find(([featureId]) => featureId === id);
  return found === undefined ? undefined : { kind: 'feature', id, name: found[1] };
}
