/**
 * Entry of the `core/parts` piece (SDD-70 §4.5): the reader of a page that arrives in parts.
 *
 * A piece of its own because only a route with `@await` needs it, and a page without one
 * downloads exactly what it did before. The coordinator hands it to `hydrate` as `parts`.
 */

import { readParts, type PartsOptions } from '../src/hydrate/parts.js';
import type { RuntimeEntry } from '../src/runtime-entry.js';

/** The uniform startup name (SDD-45 §3.4). See `bundle/hydrate.ts` for why it is an alias. */
export const install: RuntimeEntry<PartsOptions>['install'] = readParts;

export { readParts, PART_ATTR, PART_END, type PartsOptions } from '../src/hydrate/parts.js';
