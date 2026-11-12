/**
 * The fixture lines of a criterion, rewritten after `record` (SDD-82 §3.9): its `data` names what
 * the route asked for, in order, and its `answers` the group of the criterion. A line that names
 * nothing recorded goes away: the criterion then runs that part for real, as it was recorded.
 * The rest of the file is left as it was written.
 */

import { parseSpec } from '../parse.js';
import type { Criterion } from '../ast.js';

/** What a recorded criterion's `given` names: absent, the line goes. */
export interface RecordedLines {
  readonly data?: readonly string[];
  readonly answers?: string;
}

/** The lines `record` owns, in the order they are written at the top of `given`. */
const OWNED = ['data', 'answers'] as const;

/** Where the line `offset` is on starts. */
const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1;

/** The blanks the line `offset` is on starts with. */
const indentOf = (text: string, offset: number): string => /^[ \t]*/u.exec(text.slice(lineStart(text, offset)))![0];

/** The criterion `slug` of `text`, parsed again. */
function criterionOf(text: string, slug: string): Criterion | undefined {
  return parseSpec(text).value.criteria.find((c) => c.slug?.text === slug);
}

/**
 * `text` with the criterion `slug`'s `data` and `answers` lines as `lines` says. Unchanged when
 * there is no such criterion.
 */
export function recordLines(text: string, slug: string, lines: RecordedLines): string {
  let out = text;
  // From the last line to the first, so each edit leaves the offsets of the next one in place.
  for (const name of [...OWNED].reverse()) {
    const criterion = criterionOf(out, slug);
    if (criterion === undefined) return text;
    const words = name === 'data' ? lines.data : lines.answers === undefined ? undefined : [lines.answers];
    const wanted = words === undefined || words.length === 0 ? undefined : `${name} ${words.join(' ')}`;
    const given = criterion.blocks.find((b) => b.block === 'given');
    const line = given?.terms.find((t) => t.name.text === name);
    if (line !== undefined) {
      if (wanted !== undefined) out = out.slice(0, line.span.start) + wanted + out.slice(line.span.end);
      else {
        const start = lineStart(out, line.span.start);
        const end = out.indexOf('\n', line.span.end);
        out = out.slice(0, start) + out.slice(end === -1 ? out.length : end + 1);
      }
      continue;
    }
    if (wanted === undefined) continue;
    if (given !== undefined) {
      const first = given.terms[0];
      const indent = first === undefined ? `${indentOf(out, given.keyword.start)}  ` : indentOf(out, first.span.start);
      // `answers` goes after `data`, when there is one; anything else after the keyword.
      const data = name === 'answers' ? given.terms.find((t) => t.name.text === 'data') : undefined;
      const after = data?.span.end ?? given.keyword.end;
      out = `${out.slice(0, after)}\n${indent}${wanted}${out.slice(after)}`;
      continue;
    }
    // No `given`: one, first, at the indentation of the blocks that are there.
    const block = criterion.blocks[0];
    const blockIndent = block === undefined ? '  ' : indentOf(out, block.keyword.start);
    const opened = `${blockIndent}given\n${blockIndent}  ${wanted}\n`;
    if (block !== undefined) {
      const at = lineStart(out, block.keyword.start);
      out = out.slice(0, at) + opened + out.slice(at);
    } else {
      const at = criterion.span.end;
      out = `${out.slice(0, at)}\n${opened.slice(0, -1)}${out.slice(at)}`;
    }
  }
  return out;
}
