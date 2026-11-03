/**
 * `data-fud-src`: where an element of the DOM was written. Every element a template writes can
 * carry the position of its opening tag, so a tool that holds the element finds its line.
 *
 * Both branches stamp it with the same function and at the same place — right after the element
 * is made — so the tree the server sends and the tree the client fabricates stay identical.
 */

import type { ElementNode } from '../html/index.js';
import { LineMap } from '../sourcemap/index.js';
import type { CodeWriter } from './writer.js';

/** The attribute; `data-fud-*` is reserved, so an author can never write it. */
export const SOURCE_ATTRIBUTE = 'data-fud-src';

/** What an element of this file is stamped with: `<file>:<line>:<column>`, 1-based. */
export type SourceStamp = (el: ElementNode) => string;

/** The stamp of a file: `file` names it as the stamp reads, `source` is the text it was written in. */
export function sourceStamp(file: string, source: string): SourceStamp {
  const lines = new LineMap(source);
  return (el) => {
    const at = lines.positionAt(el.openSpan.start);
    return `${file}:${at.line + 1}:${at.character + 1}`;
  };
}

/**
 * The emitter option of a module: `{ stamp }` when the options ask for source locations, and
 * nothing otherwise — spread into an emitter's options, so an emit without them is unchanged.
 */
export function stampOption(
  options: { readonly sourceLocations?: string },
  source: string,
): { readonly stamp?: SourceStamp } {
  return options.sourceLocations === undefined ? {} : { stamp: sourceStamp(options.sourceLocations, source) };
}

/** The line that stamps `v`, when there is a stamp. */
export function writeStamp(w: CodeWriter, stamp: SourceStamp | undefined, el: ElementNode, v: string): void {
  if (stamp === undefined) return;
  w.line(`$dom.setAttr(${v}, '${SOURCE_ATTRIBUTE}', ${JSON.stringify(stamp(el))});`);
}
