/**
 * Walking the mapping table in both directions (SDD-23 §5, SDD-24 §4.1).
 *
 * Every LSP request crosses this boundary twice: a position in the `.fud` becomes a
 * position in a virtual file, the service answers there, and the answer comes back. A
 * stretch whose `caps` do not grant the capability being asked for **does not route** — it
 * returns `undefined` — and that single rule is what keeps rename off the scaffolding and
 * keeps diagnostics about invented code from ever reaching the user.
 */

import type { MappingCaps, VirtualFile } from './types.js';

/** A capability name, as asked for at the boundary. */
export type Capability = keyof MappingCaps;

/**
 * Where a position of the virtual file lives in the `.fud`, or `undefined` when the
 * stretch does not carry the requested capability.
 *
 * Offsets inside a stretch keep their distance from its start, which is exact because user
 * text is copied with identical length. A stretch of scaffolding has no interior worth
 * addressing, so a position inside one maps to its anchor.
 *
 * **Each side is measured with its own length.** A stretch may be longer on one side than
 * the other — `'click'` stands for `click`, an anchor of three characters stands for one —
 * so the search bound comes from the side being searched and the offset is clamped to the
 * side being returned. Measuring both with `length` made a stretch swallow the positions
 * after it, and the anchors of BUG-16 are exactly where that becomes visible: `@|` landed
 * inside the props literal of the tag and was offered attribute names instead of events.
 */
export function mapToSource(
  file: VirtualFile,
  generatedOffset: number,
  capability: Capability,
): number | undefined {
  for (const m of file.mappings) {
    if (generatedOffset < m.generatedOffset || generatedOffset > m.generatedOffset + m.length) {
      continue;
    }
    if (!m.caps[capability]) continue;
    return m.sourceOffset + Math.min(generatedOffset - m.generatedOffset, m.sourceLength);
  }
  return undefined;
}

/** The reverse: where a position of the `.fud` lives in this virtual file. */
export function mapToGenerated(
  file: VirtualFile,
  sourceOffset: number,
  capability: Capability,
): number | undefined {
  for (const m of file.mappings) {
    if (sourceOffset < m.sourceOffset || sourceOffset > m.sourceOffset + m.sourceLength) continue;
    if (!m.caps[capability]) continue;
    return m.generatedOffset + Math.min(sourceOffset - m.sourceOffset, m.length);
  }
  return undefined;
}
