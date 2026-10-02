/**
 * The formatter of a `.fudspec` (SDD-53 §4.6). It changes blanks and nothing else: no name, no
 * order, no quote. That is what lets it run on save over a file that is still being written.
 *
 * It reads the lines with the parser's own reader — the same tokens, the same comments, the
 * same level for a line indented wrong — and prints every token it read. Printing from the
 * tree instead would drop what the tree has no place for: a line the parser could not place,
 * or text after a name. A formatter that deletes what the author typed is worse than none.
 *
 * The one input it refuses is an unclosed quote (`FUD0920`): there is no telling where that
 * token ends, so any respacing of the line could move text into or out of the string.
 */

import type { SourceDiagnostic } from '@fudic/diagnostics';
import { levelOf, lines, readLine } from './line.js';

export interface FormatSpecResult {
  /** False when the text cannot be formatted safely; `text` is then the input unchanged. */
  readonly ok: boolean;
  readonly text: string;
}

/** One non-blank line, as it will be printed. */
interface Row {
  /** Undefined for a line that is only a comment: it takes its level from its neighbours. */
  readonly level: number | undefined;
  readonly text: string;
  /** A `component` or `criterion` line: it starts a group, set apart by one blank line. */
  readonly opens: boolean;
}

/** Format a `.fudspec`. `ok: false` when the text cannot be formatted safely. */
export function formatSpec(source: string): FormatSpecResult {
  const diagnostics: SourceDiagnostic[] = [];
  const rows: Row[] = [];
  for (const [start, end] of lines(source)) {
    const line = readLine(source, start, end, diagnostics);
    const comment = line.comment === undefined ? undefined : source.slice(line.comment.start, line.comment.end).trimEnd();
    const [head] = line.tokens;
    if (head === undefined) {
      if (comment !== undefined) rows.push({ level: undefined, text: comment, opens: false });
      continue;
    }
    const level = levelOf(line.indent, head.raw);
    const words = line.tokens.map((token) => token.raw).join(' ');
    rows.push({
      level,
      text: comment === undefined ? words : `${words} ${comment}`,
      opens: level === 0 && (head.raw === 'component' || head.raw === 'criterion'),
    });
  }
  if (diagnostics.some((d) => d.code === 'FUD0920')) return { ok: false, text: source };

  const eol = /\r\n|\n|\r/u.exec(source)?.[0] ?? '\n';
  const levels = commentLevels(rows);
  const starts = groupStarts(rows);
  const printed: string[] = [];
  rows.forEach((row, i) => {
    if (starts.has(i) && printed.length > 0) printed.push('');
    printed.push(' '.repeat(levels[i] as number) + row.text);
  });
  return { ok: true, text: printed.length === 0 ? '' : printed.join(eol) + eol };
}

/**
 * The level of every row. A comment on its own line is indented like the line after it, so it
 * reads as a note on what follows; at the end of the file, like the line before it.
 */
function commentLevels(rows: readonly Row[]): readonly number[] {
  const levels: number[] = rows.map(() => 0);
  let next: number | undefined;
  for (let i = rows.length - 1; i >= 0; i--) {
    const own = (rows[i] as Row).level;
    if (own !== undefined) next = own;
    levels[i] = own ?? next ?? -1;
  }
  let previous = 0;
  for (let i = 0; i < rows.length; i++) {
    if (levels[i] === -1) levels[i] = previous;
    previous = levels[i] as number;
  }
  return levels;
}

/** The rows that start a group: each `component`/`criterion`, moved up over the comments above it. */
function groupStarts(rows: readonly Row[]): ReadonlySet<number> {
  const starts = new Set<number>();
  rows.forEach((row, i) => {
    if (!row.opens) return;
    let first = i;
    while (first > 0 && (rows[first - 1] as Row).level === undefined) first--;
    starts.add(first);
  });
  return starts;
}
