/**
 * Formatting (SDD-26), answered by `@fudic/formatter`.
 *
 * The capability was declared and delegated from the first commit of this server (§3.2),
 * with the handler responding empty until the algorithm existed. This is that algorithm
 * arriving — and nothing about HOW a `.fud` is laid out is written here. It cannot be: the
 * editor and `fudic fmt` must produce the same bytes, and the only way to guarantee that is
 * for both to call the same function.
 *
 * A file that does not parse formats to nothing, silently (§4.6). "Format on save" doing
 * nothing while the file is broken is the correct behaviour: laying out an incomplete tree
 * reorganizes code the user is halfway through writing.
 */

import { format, formatRange, type FormatOptions, type FormatResult } from '@fudic/formatter';
import type { Span } from '@fudic/compiler';

/** What the editor tells us about indentation. The rest of §3 keeps its defaults. */
export interface EditorFormattingOptions {
  readonly tabSize: number;
  readonly insertSpaces: boolean;
}

/**
 * The formatter options, from the editor's.
 *
 * `endOfLine: 'auto'` because the source is the authority in an editor: a file with CRLF is
 * a file the user's tooling produced, and a formatter that flips it makes every line of the
 * next diff its own.
 */
export function optionsFrom(editor: EditorFormattingOptions): Partial<FormatOptions> {
  return { tabWidth: editor.tabSize, useTabs: !editor.insertSpaces, endOfLine: 'auto' };
}

/**
 * The formatted text for a document, or `undefined` when there is nothing to do.
 *
 * `undefined` covers both silences: the file did not parse, and the file was already
 * formatted. An editor that receives no edit leaves the buffer alone, which is what both
 * cases mean.
 */
export async function formattedText(
  source: string,
  editor: EditorFormattingOptions,
  range?: Span,
): Promise<string | undefined> {
  const options = optionsFrom(editor);
  const result: FormatResult =
    range === undefined ? await format(source, options) : await formatRange(source, range, options);
  return result.ok && result.text !== source ? result.text : undefined;
}
