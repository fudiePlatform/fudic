/**
 * `fudic.applySnippetEdit` — the one command nobody picks (SDD-36 §3.1).
 *
 * It is not in the palette and it takes arguments, because it is the far end of a quick fix:
 * the server sends «complete the required props of `<app-input>`» as a `command` rather than
 * as an `edit`, and the reason is that LSP has no per-edit snippet flag. A `WorkspaceEdit`
 * carrying `$1` writes a literal `$1` into the file; only the editor knows what a tabstop is,
 * and only our own extension can ask it.
 *
 * Everything the server sends crosses as JSON, so the arguments are validated here rather than
 * cast. A command is a public surface — anything in the window can invoke it with anything —
 * and the failure of a malformed call has to be «nothing happens», not a write at a position
 * that was never a range.
 */

import type { SnippetEdit, SnippetEditPort, WireRange } from '../ports.js';

/** The id, which is the contract with the server: it sends this exact string. */
export const APPLY_SNIPPET_EDIT = 'fudic.applySnippetEdit';

const isPosition = (value: unknown): value is { line: number; character: number } => {
  const at = value as { line?: unknown; character?: unknown } | null;
  return typeof at?.line === 'number' && typeof at.character === 'number';
};

const isRange = (value: unknown): value is WireRange => {
  const range = value as { start?: unknown; end?: unknown } | null;
  return range !== null && isPosition(range.start) && isPosition(range.end);
};

/** The arguments as a `SnippetEdit`, or nothing when they are not one. */
export function snippetEditOf(args: readonly unknown[]): SnippetEdit | undefined {
  const [uri, range, snippet] = args;
  if (typeof uri !== 'string' || typeof snippet !== 'string' || !isRange(range)) return undefined;
  return { uri, range, snippet };
}

/** Apply the edit the server computed, tabstops and all. */
export async function applySnippetEdit(
  port: SnippetEditPort,
  args: readonly unknown[],
): Promise<void> {
  const edit = snippetEditOf(args);
  if (edit === undefined) return;
  await port.apply(edit);
}
