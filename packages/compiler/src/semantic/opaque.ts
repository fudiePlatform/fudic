/**
 * «Is this offset code, or is it text?» — asked once, for every rule that has to (BUG-30 §4.5).
 *
 * Two SDD-12 rules read the SOURCE of a `@code` part rather than its Oxc AST, and they are
 * right to: SDD-08 hands a region's body to Oxc as one opaque fragment, and the layout rule
 * must hold even when that fragment did not parse. What neither may do is treat a comment or a
 * string as code — a `// move this to @client` is prose, and a compiler that rejects it is
 * rejecting a correct file.
 *
 * The answer needs no lexer. The SDD-02 balancer already walked every string, template,
 * comment and regex of the body, and SDD-08 publishes the result as `CodeBlockNode.regions`.
 * This module only spends it.
 */

import type { LexRegion } from '../balancer/index.js';

/**
 * `source[start, end)` with every character that falls inside an opaque region replaced by a
 * space, line terminators kept.
 *
 * Character for character, like `redactServerRegions` and for the same reason: the callers
 * match a regular expression over the result and report the offset it lands on. Shortening the
 * text — or dropping the regions from it — would move every span after the first comment. What
 * comes back is the same length, the same lines and the same columns, with the prose blanked.
 *
 * `regions` are absolute offsets into `source` and may nest (a string inside a template
 * interpolation is listed on its own); blanking a span twice is blanking it once, so nesting
 * needs no special case. Regions outside `[start, end)` are simply clipped away.
 */
export function maskOpaque(
  source: string,
  regions: readonly LexRegion[],
  start: number,
  end: number,
): string {
  let out = '';
  let cursor = start;
  for (const region of regions) {
    const from = Math.max(region.span.start, cursor);
    const to = Math.min(region.span.end, end);
    if (to <= from) continue;
    out += source.slice(cursor, from) + blank(source, from, to);
    cursor = to;
  }
  return out + source.slice(cursor, end);
}

/** Replace every character of `[from, to)` with a space, keeping line terminators. */
function blank(source: string, from: number, to: number): string {
  let out = '';
  for (let i = from; i < to; i += 1) {
    const char = source[i];
    out += char === '\n' || char === '\r' ? char : ' ';
  }
  return out;
}
