// Entry of the `core/parts` runtime piece: only a streamed page downloads it.

import { readParts, type PartsOptions } from '../src/hydrate/parts.js';
import type { RuntimeEntry } from '../src/runtime-entry.js';

export const install: RuntimeEntry<PartsOptions>['install'] = readParts;

export { readParts, PART_ATTR, PART_END, type PartsOptions } from '../src/hydrate/parts.js';
