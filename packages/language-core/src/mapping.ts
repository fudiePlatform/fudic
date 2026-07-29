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
    return m.sourceOffset + Math.min(generatedOffset - m.generatedOffset, m.length);
  }
  return undefined;
}

/** The minimum a diagnostic must carry to be deduplicated. */
export interface MappedDiagnostic {
  /** Name of the virtual file it was reported in. */
  readonly virtual: string;
  /** Offset in the `.fud`. */
  readonly sourceOffset: number;
  readonly code: number;
}

/**
 * Drop the duplicates the neutral zone creates (SDD-23 §4.1).
 *
 * The neutral zone is emitted into both the client and the server virtual, because its
 * declarations must be visible on both sides. An error inside it is therefore found twice,
 * and without this the user sees every such error duplicated in the editor.
 *
 * The client virtual wins: it is the file the user is looking at when editing markup, and
 * it is the one that holds the template.
 */
export function dedupeDiagnostics<T extends MappedDiagnostic>(
  diagnostics: readonly T[],
  clientVirtual: string,
): readonly T[] {
  const seen = new Map<string, T>();

  for (const d of diagnostics) {
    const key = `${d.sourceOffset}:${d.code}`;
    const previous = seen.get(key);
    if (previous === undefined || (previous.virtual !== clientVirtual && d.virtual === clientVirtual)) {
      seen.set(key, d);
    }
  }
  return [...seen.values()];
}

/** The reverse: where a position of the `.fud` lives in this virtual file. */
export function mapToGenerated(
  file: VirtualFile,
  sourceOffset: number,
  capability: Capability,
): number | undefined {
  for (const m of file.mappings) {
    if (sourceOffset < m.sourceOffset || sourceOffset > m.sourceOffset + m.length) continue;
    if (!m.caps[capability]) continue;
    return m.generatedOffset + (sourceOffset - m.sourceOffset);
  }
  return undefined;
}
