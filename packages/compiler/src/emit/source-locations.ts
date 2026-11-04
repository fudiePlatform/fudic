/**
 * `data-fud-src`: where an element of the DOM was written. Every element a template writes can
 * carry the place of its opening tag, so a tool that holds the element finds its line.
 *
 * The place is the one in the file the author wrote. The emit reads the text AFTER the snippet
 * expansion, where a snippet's body sits at its `@render`; the expansion's table sends each
 * position back to its own file — the caller's, or the snippet's — and the host, which can read
 * files, turns that into `<file>:<line>:<column>`.
 *
 * Both branches stamp with the same function and at the same point — right after the element is
 * made — so the tree the server sends and the tree the client fabricates stay identical.
 */

import type { OffsetMap } from '../expand/offsets.js';
import type { ElementNode } from '../html/index.js';
import type { CodeWriter } from './writer.js';

/** The attribute; `data-fud-*` is reserved, so an author can never write it. */
export const SOURCE_ATTRIBUTE = 'data-fud-src';

/** The stamp of a place: an absolute file and an offset in its text → `<file>:<line>:<column>`. */
export type SourceLocator = (file: string, offset: number) => string;

/** What an element of the walk is stamped with. */
export type SourceStamp = (el: ElementNode) => string;

/**
 * The stamp of a walk over `path`'s text. `map` is its expansion table when the text is the
 * expanded one; without it, an offset is already the file's own.
 */
export function sourceStamp(path: string, map: OffsetMap | undefined, locate: SourceLocator): SourceStamp {
  return (el) => {
    const offset = el.openSpan.start;
    const origin = map?.origin(offset);
    return origin === undefined ? locate(path, offset) : locate(origin.file, origin.offset);
  };
}

/**
 * The emitter option of a walk: `{ stamp }` when the options ask for source locations, and
 * nothing otherwise — spread into an emitter's options, so an emit without them is unchanged.
 */
export function stampOption(
  options: { readonly sourceLocations?: SourceLocator },
  path: string,
  map?: OffsetMap,
): { readonly stamp?: SourceStamp } {
  return options.sourceLocations === undefined ? {} : { stamp: sourceStamp(path, map, options.sourceLocations) };
}

/** The line that stamps `v`, when there is a stamp. */
export function writeStamp(w: CodeWriter, stamp: SourceStamp | undefined, el: ElementNode, v: string): void {
  if (stamp === undefined) return;
  w.line(`$dom.setAttr(${v}, '${SOURCE_ATTRIBUTE}', ${JSON.stringify(stamp(el))});`);
}
