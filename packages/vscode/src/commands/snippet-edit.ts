/**
 * `fudic.applySnippetEdit` — the one command nobody picks (SDD-36 §3.1).
 *
 * It is not in the palette and it takes arguments, because it is the far end of a quick fix:
 * the server sends «complete the required props of `<app-input>`» as a `command` rather than
 * as an `edit`, and the reason is that LSP has no per-edit snippet flag. A `WorkspaceEdit`
 * carrying `$1` writes a literal `$1` into the file; only the editor knows what a tabstop is,
 * and only our own extension can ask it.
 *
 * **The repair lands either way.** Inserting a snippet needs a live `TextEditor` on the very
 * document the fix was computed for, and there are ordinary reasons for there not to be one —
 * the focus moved, the file is open in another group, the editor is in a state that refuses.
 * Every one of them used to end here as «the bulb does nothing», which is the worst thing a
 * quick fix can do: the author is told a repair exists and then gets silence. So the tabstops
 * are the ENHANCEMENT and the edit is the promise — when the snippet cannot be inserted the
 * same text goes in as a plain edit, holes emptied, and the caret is the only thing lost.
 *
 * Everything the server sends crosses as JSON, so the arguments are validated rather than cast.
 * A command is a public surface — anything in the window can invoke it with anything — and a
 * malformed call has to do nothing, not write at a position that was never a range.
 */

import type { SnippetEdit, SnippetEditPort, WireRange } from '../ports.js';

/** The id, which is the contract with the server: it sends this exact string. */
export const APPLY_SNIPPET_EDIT = 'fudic.applySnippetEdit';

const isPosition = (value: unknown): value is { line: number; character: number } => {
  const at = value as { line?: unknown; character?: unknown } | null | undefined;
  return typeof at?.line === 'number' && typeof at.character === 'number';
};

const isRange = (value: unknown): value is WireRange => {
  const range = value as { start?: unknown; end?: unknown } | null | undefined;
  return (
    range !== null &&
    range !== undefined &&
    isPosition(range.start) &&
    isPosition(range.end)
  );
};

/** The arguments as a `SnippetEdit`, or nothing when they are not one. */
export function snippetEditOf(args: readonly unknown[]): SnippetEdit | undefined {
  const [uri, range, snippet] = args;
  if (typeof uri !== 'string' || typeof snippet !== 'string' || !isRange(range)) return undefined;
  return { uri, range, snippet };
}

const DIGIT = /[0-9]/u;

/**
 * The same text with its tabstops taken out — what goes in when no editor can take a snippet.
 *
 * `<app-input .id="$1" .name="$2">` becomes `<app-input .id="" .name="">`: the holes are still
 * holes, the author just has to click into the first one. A backslash escapes the next
 * character, which is how the server protects a `$` the AUTHOR wrote — `.href="$route"` has to
 * survive this as a `$`, not disappear as a tabstop.
 */
export function plainTextOf(snippet: string): string {
  let out = '';
  for (let i = 0; i < snippet.length; i++) {
    const char = snippet.charAt(i);
    if (char === '\\') {
      out += snippet.charAt(i + 1);
      i++;
      continue;
    }
    if (char === '$') {
      let end = i + 1;
      while (end < snippet.length && DIGIT.test(snippet.charAt(end))) end++;
      // `$` followed by digits is a tabstop and vanishes; a bare `$` is text and stays.
      if (end > i + 1) {
        i = end - 1;
        continue;
      }
    }
    out += char;
  }
  return out;
}

/** Apply the edit the server computed: with tabstops when it can, without them when it cannot. */
export async function applySnippetEdit(
  port: SnippetEditPort,
  args: readonly unknown[],
): Promise<void> {
  const edit = snippetEditOf(args);
  if (edit === undefined) {
    port.log(`applySnippetEdit: ignored, the arguments are not an edit: ${JSON.stringify(args)}`);
    return;
  }

  if (await port.insert(edit)) return;

  port.log(`applySnippetEdit: no editor for ${edit.uri}, applying it without tabstops`);
  await port.replace({ uri: edit.uri, range: edit.range, text: plainTextOf(edit.snippet) });
}
