/**
 * «Find all references» over a component tag: every element written with it, in the project and
 * in its libraries.
 *
 * Asked on the tag NAME — in a use, or on the component's own host in its file, which is where
 * someone about to change a component asks who uses it. The uses come from the index
 * (`usesOf`), which read them when it parsed each file: no file is parsed again to answer.
 */

import type { Span } from '@fudic/compiler';
import type { CachedDocument } from '../document-cache.js';
import type { WorkspaceIndex } from '../workspace-index.js';
import { tagNameAt } from './position.js';

/** One use of the tag, with the text of its file so the caller can place it. */
export interface TagReference {
  readonly path: string;
  readonly span: Span;
  readonly text: string;
}

/**
 * The uses of the component tag at `offset`, or nothing when the offset is not on one.
 *
 * The open document's text stands for its file, because what the editor shows is what has to
 * be underlined; any other file is read from the index's filesystem. One that can no longer be
 * read is left out rather than placed over nothing.
 */
export function tagReferencesAt(
  cached: CachedDocument,
  index: WorkspaceIndex,
  offset: number,
): readonly TagReference[] | undefined {
  const name = tagNameAt(cached.source, offset);
  // A native element has no hyphen (decision 41) and no uses to list.
  if (name === undefined || !name.text.includes('-')) return undefined;
  const uses = index.usesOf(name.text);
  if (uses.length === 0) return undefined;
  return uses.flatMap((use) => {
    const text = use.path === cached.path ? cached.source : index.read(use.path);
    return text === undefined ? [] : [{ ...use, text }];
  });
}
