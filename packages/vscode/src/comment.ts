/**
 * Commenting, one region at a time (BUG-22 §5).
 *
 * VS Code takes its comment delimiters from `language-configuration.json`, one set per
 * language — and a `.fud` is three languages. So <kbd>Ctrl</kbd>+<kbd>/</kbd> wrote `@* *@`
 * inside `@code`, where the language is TypeScript, and inside `<style>`, where it is CSS.
 * Neither is a comment there; both are a syntax error the author then has to undo by hand.
 *
 * The editor cannot be taught to switch per region, so the command does the toggling itself.
 * WHICH delimiters belong at a position is the server's answer, over the tree; what is here is
 * the toggle, and it is pure text: given the lines, the syntax and whether they are already
 * commented, produce the replacement.
 */

import type { CommentSyntax } from './ports.js';

/**
 * The stretch of a document a toggle replaces, and what it is replaced with.
 *
 * Lines rather than one string, so the line ending never enters here: a `.fud` written on
 * Windows is `\r\n` and one written anywhere else is `\n`, and a toggle that joined them itself
 * would convert the file it was asked to comment.
 */
export interface CommentEdit {
  /** Line numbers, both ends included. */
  readonly firstLine: number;
  readonly lastLine: number;
  readonly newLines: readonly string[];
}

/** Whether every line that has anything on it already starts with the line comment. */
function allLineCommented(lines: readonly string[], token: string): boolean {
  const written = lines.filter((line) => line.trim() !== '');
  return written.length > 0 && written.every((line) => line.trim().startsWith(token));
}

/** The indent of the least-indented line that has anything on it. */
function commonIndent(lines: readonly string[]): string {
  let indent: string | undefined;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const own = line.slice(0, line.length - line.trimStart().length);
    if (indent === undefined || own.length < indent.length) indent = own;
  }
  return indent ?? '';
}

/** Add the line comment to every line that has anything on it, at the shared indent. */
function addLineComment(lines: readonly string[], token: string): string {
  const indent = commonIndent(lines);
  return lines
    .map((line) => (line.trim() === '' ? line : `${indent}${token} ${line.slice(indent.length)}`))
    .join('\n');
}

/**
 * Take the line comment off, with the single space it was added with.
 *
 * The space is optional on the way out and not on the way in: `//x` was written by somebody
 * else, or by an older version of this, and refusing to uncomment it would be a toggle that
 * only undoes its own work.
 */
function removeLineComment(lines: readonly string[], token: string): string {
  return lines
    .map((line) => {
      const at = line.indexOf(token);
      if (at === -1) return line;
      const after = line.slice(at + token.length);
      return line.slice(0, at) + (after.startsWith(' ') ? after.slice(1) : after);
    })
    .join('\n');
}

/** The pair `text` is already wrapped in, if it is wrapped in one of them. */
function wrappedIn(text: string, syntax: CommentSyntax): readonly [string, string] | undefined {
  const trimmed = text.trim();
  return syntax.removes.find(([open, close]) => {
    // Both ends, and long enough to hold them: `@*@` opens and closes with the same characters.
    return (
      trimmed.startsWith(open) &&
      trimmed.endsWith(close) &&
      trimmed.length >= open.length + close.length
    );
  });
}

/** Strip a block comment, keeping the indentation and whatever surrounded it. */
function unwrap(text: string, [open, close]: readonly [string, string]): string {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  const inner = text.slice(start + open.length, end);
  // The space this adds on the way in comes off; one written by hand does not have to be there.
  const trimmed = inner.startsWith(' ') ? inner.slice(1) : inner;
  const body = trimmed.endsWith(' ') ? trimmed.slice(0, -1) : trimmed;
  return text.slice(0, start) + body + text.slice(end + close.length);
}

/**
 * Toggle the comment over whole lines.
 *
 * Whole lines rather than the exact selection, because that is what <kbd>Ctrl</kbd>+<kbd>/</kbd>
 * does everywhere else and because a block comment that starts mid-line is a block comment
 * somebody has to look at twice. A selection of nothing is the line the caret is on.
 *
 * A region with a line comment uses it, because that is what the language itself reads best;
 * a region without one gets a block around the whole stretch.
 */
export function toggleComment(
  lines: readonly string[],
  firstLine: number,
  lastLine: number,
  syntax: CommentSyntax,
): CommentEdit {
  const selected = lines.slice(firstLine, lastLine + 1);
  const token = syntax.line;
  const newText = token !== undefined ? lineToggle(selected, token) : blockToggle(selected, syntax);

  return { firstLine, lastLine, newLines: newText.split('\n') };
}

function lineToggle(selected: readonly string[], token: string): string {
  return allLineCommented(selected, token)
    ? removeLineComment(selected, token)
    : addLineComment(selected, token);
}

function blockToggle(selected: readonly string[], syntax: CommentSyntax): string {
  const text = selected.join('\n');
  const wrapping = wrappedIn(text, syntax);
  if (wrapping !== undefined) return unwrap(text, wrapping);

  const [open, close] = syntax.block;
  const indent = commonIndent(selected);
  return `${indent}${open} ${text.slice(indent.length)} ${close}`;
}
