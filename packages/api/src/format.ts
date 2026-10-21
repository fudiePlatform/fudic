/**
 * The formatter of a `.fudapi` (SDD §4.9). It changes blanks and nothing else: no name, no
 * order, no quote. That is what lets it run on save over a file that is still being written.
 *
 * It reads the lines with the parser's own reader and places them by the same rules — the same
 * level for a line indented wrong, the same continuation lines — and prints every token it
 * read. Printing from the tree instead would drop what the tree has no place for.
 *
 * - 2 spaces per level, one space between tokens, one blank line between declarations.
 * - Among the lines of one block, the types of the `<name>  <type>` lines line up, and so do
 *   the texts that end a line; a column is two spaces past the widest cell before it.
 * - A continuation line is indented two spaces past the first two words of its line.
 * - Consecutive `pattern` declarations stay together, their regexes lined up.
 *
 * The one input it refuses is an unclosed quote: there is no telling where that token ends, so
 * any respacing could move text into or out of the string. The text comes back unchanged.
 */

import type { SourceDiagnostic } from '@fudic/diagnostics';
import { isString, lines, readLine, type Token } from './line.js';

/** One non-blank line, as it will be printed. */
interface Row {
  /** Undefined for a line that is only a comment: it takes its level from its neighbours. */
  level: number | undefined;
  readonly tokens: readonly Token[];
  readonly comment?: string;
  /** A blank line was right above it in the source. */
  readonly blankBefore: boolean;
  /** The row it continues, for a continuation line. */
  readonly continues?: Row;
  /** The text of the row as printed, filled in once its block's columns are known. */
  text: string;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;

/** Words a line starts with that make it something other than a `<name>  <type>` line. */
const KEYWORDS = new Set([
  'use', 'skip', 'form', 'invalidates', 'compress', 'fails', 'query', 'validate-on', 'validity',
  'catches', 'summary', 'range', 'require', 'when', 'on', 'runs', 'async', 'client', 'server',
  'adds', 'messages', 'chain', 'load', 'paths', 'layout', 'type', 'enum', 'rule', 'middleware',
  'pattern', 'get', 'post', 'put', 'patch', 'delete',
]);

/** Format a `.fudapi`. A text with an unclosed quote comes back as it was. */
export function formatApi(source: string): string {
  const diagnostics: SourceDiagnostic[] = [];
  const rows: Row[] = [];
  let blank = false;
  let previous: Row | undefined;
  for (const [start, end] of lines(source)) {
    const line = readLine(source, start, end, diagnostics);
    const comment = line.comment === undefined ? undefined : source.slice(line.comment.start, line.comment.end).trimEnd();
    const [head] = line.tokens;
    if (head === undefined) {
      if (comment === undefined) blank = true;
      else rows.push({ level: undefined, tokens: [], comment, blankBefore: blank, text: '' });
      if (comment !== undefined) blank = false;
      continue;
    }
    const base = { tokens: line.tokens, ...(comment !== undefined ? { comment } : {}), blankBefore: blank, text: '' };
    blank = false;
    if (previous !== undefined && !line.tabbed && line.indent > (previous.level! + 1) * 2 && isString(head)) {
      rows.push({ ...base, level: previous.level, continues: previous });
      continue;
    }
    const level = Math.min(Math.floor(line.indent / 2), previous === undefined ? 0 : previous.level! + 1);
    previous = { ...base, tokens: level === 0 ? regexWhole(source, line.tokens) : line.tokens, level };
    rows.push(previous);
  }
  // The line reader reports one thing only, an unclosed quote: any report is a refusal.
  if (diagnostics.length > 0) return source;

  commentLevels(rows);
  columns(rows);

  const eol = /\r\n|\n|\r/u.exec(source)?.[0] ?? '\n';
  const blanks = blankRows(rows);
  const printed: string[] = [];
  rows.forEach((row, i) => {
    if (blanks.has(i)) printed.push('');
    printed.push(indentOf(row) + row.text);
  });
  return printed.length === 0 ? '' : printed.join(eol) + eol;
}

/**
 * The rows a blank line goes above. Each declaration but the first, counting the comments glued
 * right above it as its own; and a line the source set apart from a comment above it, so that
 * the comment does not become its documentation. Consecutive `pattern` lines stay together.
 */
function blankRows(rows: readonly Row[]): ReadonlySet<number> {
  const blanks = new Set<number>();
  let lastPattern = false;
  rows.forEach((row, i) => {
    if (row.blankBefore && i > 0 && rows[i - 1]!.tokens.length === 0) blanks.add(i);
    if (row.tokens.length === 0 || row.level !== 0 || row.continues !== undefined) return;
    let lead = i;
    while (lead > 0 && rows[lead - 1]!.tokens.length === 0 && !rows[lead]!.blankBefore) lead--;
    const isPattern = row.tokens[0]!.raw === 'pattern';
    if (lead > 0 && !(isPattern && lastPattern && lead === i)) blanks.add(lead);
    lastPattern = isPattern;
  });
  return blanks;
}

/**
 * A `pattern` the formatter moves to level 0 becomes a declaration, whose regex is the rest of
 * the line as written: when it was read indented, as tokens, they are put back as that one text.
 */
function regexWhole(source: string, tokens: readonly Token[]): readonly Token[] {
  if (tokens[0]!.raw !== 'pattern' || tokens.length <= 3) return tokens;
  const from = tokens[2]!.span.start;
  const to = tokens[tokens.length - 1]!.span.end;
  return [tokens[0]!, tokens[1]!, { span: { start: from, end: to }, raw: source.slice(from, to), quoted: [] }];
}

/** The blanks a row is printed after. */
function indentOf(row: Row): string {
  const owner = row.continues;
  if (owner === undefined) return ' '.repeat(row.level! * 2);
  const words = owner.tokens.slice(0, 2).map((t) => t.raw).join(' ');
  return ' '.repeat(owner.level! * 2 + words.length + 2);
}

/**
 * The level of every comment row: the level of the line after it, so it reads as a note on
 * what follows; at the end of the file, the level of the line before it.
 */
function commentLevels(rows: Row[]): void {
  let next: number | undefined;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!;
    if (row.level === undefined) row.level = next;
    else next = row.level;
  }
  let before = 0;
  for (const row of rows) {
    row.level ??= before;
    before = row.level;
  }
}

/** A `<name>  <type>` line: an identifier that is no keyword, then a type. */
const typed = (row: Row): boolean =>
  row.tokens.length >= 2 && IDENTIFIER.test(row.tokens[0]!.raw) && !KEYWORDS.has(row.tokens[0]!.raw) && !isString(row.tokens[1]!);

/** A line that ends in a text: a string that is not the initial value after `=` nor a regex. */
const texted = (row: Row): boolean =>
  row.tokens.length >= 2 &&
  !pattern(row) &&
  isString(row.tokens[row.tokens.length - 1]!) &&
  row.tokens[row.tokens.length - 2]!.raw !== '=';

/** A level-0 `pattern` line with its regex. */
const pattern = (row: Row): boolean => row.level === 0 && row.tokens.length === 3 && row.tokens[0]!.raw === 'pattern';

/**
 * The text of every row, with the columns of its block lined up. A block is a run of rows at
 * one level under one parent; a column only lines up when two rows or more of the block have it.
 */
function columns(rows: Row[]): void {
  const blocks = new Map<Row | undefined, Row[]>();
  const parents: (Row | undefined)[] = [];
  for (const row of rows) {
    if (row.tokens.length === 0) {
      row.text = row.comment!;
      continue;
    }
    if (row.continues !== undefined) {
      row.text = render(row.tokens, row.comment);
      continue;
    }
    const level = row.level!;
    parents.length = level + 1;
    const parent = level === 0 ? undefined : parents[level - 1];
    parents[level] = row;
    const block = blocks.get(parent) ?? [];
    blocks.set(parent, block);
    block.push(row);
  }
  for (const block of blocks.values()) align(block);
}

/** Lays out the rows of one block. */
function align(block: readonly Row[]): void {
  const fields = block.filter(typed);
  const nameWidth = Math.max(0, ...fields.map((r) => r.tokens[0]!.raw.length + 2));
  const patterns = block.filter(pattern);
  const patternWidth = Math.max(0, ...patterns.map((r) => r.tokens[1]!.raw.length + 2));

  const heads = new Map<Row, string>();
  for (const row of block) {
    const body = texted(row) ? row.tokens.slice(0, -1) : row.tokens;
    let head: string;
    if (typed(row)) head = row.tokens[0]!.raw.padEnd(nameWidth) + words(body.slice(1));
    else if (pattern(row)) head = `pattern ${row.tokens[1]!.raw.padEnd(patternWidth)}${row.tokens[2]!.raw}`;
    else head = words(body);
    heads.set(row, head);
  }

  const textColumn = Math.max(0, ...block.filter(texted).map((r) => heads.get(r)!.length + 2));
  for (const row of block) {
    const head = heads.get(row)!;
    const line = texted(row) ? head.padEnd(textColumn) + row.tokens[row.tokens.length - 1]!.raw : head;
    row.text = row.comment === undefined ? line : `${line} ${row.comment}`;
  }
}

const words = (tokens: readonly Token[]): string => tokens.map((t) => t.raw).join(' ');

const render = (tokens: readonly Token[], comment: string | undefined): string =>
  comment === undefined ? words(tokens) : `${words(tokens)} ${comment}`;
