/**
 * The filesystem `ResolveIo` for the compiler (SDD-15 keeps the compiler fs-free;
 * the host injects I/O). The plugin backs it with node so `resolveComponents` can
 * follow the `<link rel="component">` graph across files.
 *
 * Since SDD-43 the resolution itself is `@fudic/resolve`, not `node:path`: an `href` may
 * name a package (`@acme/ui/card.fud`) and not only a location, and the answer has to be
 * the same one the language server gives. `ResolveIo` does not change shape — a specifier
 * is an `href` like any other, and the seam still hands back a string.
 */

import { readFileSync } from 'node:fs';
import { nodeResolveFs, resolveHref, resolveHrefPath, type HrefResolution } from '@fudic/resolve';
import { type ResolveIo } from '@fudic/compiler';
import type { LinkCheckIo } from './link-check.js';

/** One filesystem for the whole build: `createRequire` caches, and the disk does not move. */
const fs = nodeResolveFs();

/** A node-backed `ResolveIo`: read by absolute path, resolve an href against its file. */
export function nodeIo(): ResolveIo {
  return {
    read: (path) => readFileSync(path, 'utf8'),
    resolve: (from, href) => resolveHrefPath(from, href, fs),
  };
}

/**
 * What the link check needs: a read that tolerates a missing file, and the WHOLE answer for
 * an href — which `ResolveIo` cannot carry, because it returns a string.
 *
 * Built on the same `fs` as `nodeIo`, so the check and the graph walk ask one resolver. Two
 * would be two opinions about which file a tag is, and they would drift (SDD-43 §5).
 */
export function nodeLinkCheckIo(): LinkCheckIo {
  return {
    read: (path) => {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        // Not there. Whoever pointed at it reports it; this pass only stops walking.
        return undefined;
      }
    },
    resolve: (from, href): HrefResolution => resolveHref(from, href, fs),
  };
}
