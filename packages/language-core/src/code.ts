/**
 * Partition of a `@code` block into the three audiences of its JS (SDD-23 §4.1).
 *
 * The neutral zone is shared, so it is emitted into BOTH virtual files: its declarations
 * must be visible on both sides. The `@server` and `@client` regions go to one file each,
 * and that is the whole enforcement of the server/client split — two separate programs.
 * Referencing a `@server` symbol from the template is then `TS2304 Cannot find name`,
 * reported by the type checker, with no rule of ours involved.
 */

import type { CodeBlockNode, Span } from '@fudic/compiler';

/** The JS spans of a `@code`, grouped by which program they belong to. */
export interface CodePartition {
  /** Neutral chunks, in source order. Emitted into both virtuals. */
  readonly neutral: readonly Span[];
  /** `@server` region bodies, in source order. */
  readonly server: readonly Span[];
  /** `@client` region bodies, in source order. */
  readonly client: readonly Span[];
}

/**
 * Group the parts of a `@code` by audience. Free source order is preserved within each
 * group (decision 34).
 *
 * A missing `@code` yields three empty groups rather than a special case for callers, and
 * repeated regions are kept and concatenated instead of dropped: uniqueness (decisions
 * 33.a/b) is the semantic pass's diagnostic to report, and an emitter that silently
 * discarded the second region would blank out code the user can see on screen.
 */
export function partitionCode(code: CodeBlockNode | undefined): CodePartition {
  const neutral: Span[] = [];
  const server: Span[] = [];
  const client: Span[] = [];

  for (const part of code?.parts ?? []) {
    if (part.type === 'neutral-js') neutral.push(part.js);
    else if (part.type === 'server-region') server.push(part.js);
    else client.push(part.js);
  }

  return { neutral, server, client };
}
