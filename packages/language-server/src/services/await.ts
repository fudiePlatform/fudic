/**
 * `@await` in the editor (SDD-70 §4.1): which fields a route can wait for, and what is being
 * typed after `@await data.`.
 *
 * The list there is SELECTIVE: only the fields of `load` marked `later`. `@await` exists so the
 * first byte leaves before the slow part of `load`, and offering a field that is already
 * resolved would only offer `FUD1320`.
 */

import { documentRoots, walk, type AwaitNode, type Span } from '@fudic/compiler';
import type { LaterField } from '@fudic/language-core';
import type { CachedDocument } from '../document-cache.js';

/** The fields of `load` marked `later`, of every `.fudapi` the document links. */
export function laterFields(cached: CachedDocument): readonly LaterField[] {
  return cached.registry.servers().flatMap((server) => server.later ?? []);
}

/** `data.` and the part of a field name written after it, up to the caret. */
const PARTIAL = /^data\.([A-Za-z_$][\w$]*)?$/u;

/**
 * The field name being typed after `@await data.` at `offset`: its text so far and where it
 * starts. `undefined` anywhere else — outside what an `@await` waits for, or before the dot.
 */
export function awaitedFieldAt(cached: CachedDocument, offset: number): { readonly text: string; readonly span: Span } | undefined {
  let found: AwaitNode | undefined;
  walk(documentRoots(cached.document), {
    awaitBlock(node) {
      if (offset >= node.expression.start && offset <= node.expression.end) found = node;
    },
  });
  if (found === undefined) return undefined;
  const typed = PARTIAL.exec(cached.source.slice(found.expression.start, offset));
  if (typed === null) return undefined;
  const text = typed[1] ?? '';
  return { text, span: { start: offset - text.length, end: offset } };
}
