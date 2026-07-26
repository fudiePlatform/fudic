/**
 * The filesystem `ResolveIo` for the compiler (SDD-15 keeps the compiler fs-free;
 * the host injects I/O). The plugin backs it with node so `resolveComponents` can
 * follow the `<link rel="component">` graph across files.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { type ResolveIo } from '@fudic/compiler';

/** A node-backed `ResolveIo`: read by absolute path, resolve an href against its file. */
export function nodeIo(): ResolveIo {
  return {
    read: (path) => readFileSync(path, 'utf8'),
    resolve: (from, href) => resolve(dirname(from), href),
  };
}
