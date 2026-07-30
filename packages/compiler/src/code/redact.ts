/**
 * A view of a `.fud` source with its `@server` regions blanked (BUG-09 §4.3).
 *
 * It exists for one consumer: the `sourcesContent` of a source map. A map embeds the
 * original file so a debugger can show it, and the original file of a page contains the
 * `@server` region — database calls, tokens, internal URLs. Publishing the map published
 * them, on a build where the compiled output was already clean.
 *
 * The blanking is CHARACTER FOR CHARACTER, and that is the whole design. A map's
 * `mappings` are offsets into this text; shortening it would move every position after the
 * first region and leave a map that resolves to the wrong place. Same length, same lines,
 * same columns — and the server code gone. Line terminators survive so the file still has
 * the shape a human recognises, and `@server {` and its closing brace stay: what is hidden
 * should look hidden, not look absent.
 */

import type { CodeBlockNode } from './nodes.js';

/** Replace every character of `[start, end)` with a space, keeping line terminators. */
function blank(source: string, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i += 1) {
    const char = source[i];
    out += char === '\n' || char === '\r' ? char : ' ';
  }
  return out;
}

/**
 * The source with the body of every `@server` region blanked.
 *
 * Only the region's `js` span goes — the marker around it stays, so the redaction reads as
 * a redaction. A source with no `@code`, or with no `@server` inside it, comes back
 * untouched and identical.
 */
export function redactServerRegions(source: string, code: CodeBlockNode | undefined): string {
  if (code === undefined) {
    return source;
  }
  let out = '';
  let cursor = 0;
  for (const part of code.parts) {
    if (part.type !== 'server-region') {
      continue;
    }
    out += source.slice(cursor, part.js.start) + blank(source, part.js.start, part.js.end);
    cursor = part.js.end;
  }
  return out + source.slice(cursor);
}
