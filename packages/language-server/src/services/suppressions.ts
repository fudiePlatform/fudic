/**
 * The `fud-disable` comments in the editor (SDD-83 §3.11): the bulbs that write them, the bulb that
 * takes one out when it silences nothing, the completion of the codes after the keyword and the hover
 * over a code written in one.
 *
 * Everything here works on the text of a file and the comment delimiters of the place in it, so a
 * `.fud`, a `.fudapi` and a `.fudspec` share it: each service only says which delimiters a line takes.
 * The bulbs never write a comment the reader would refuse: the reason is the author's, and the cursor
 * is left where it goes.
 */

import { codeInfo, liveCodes, reportedLevel, type FudCode, type Policy, type Span } from '@fudic/diagnostics';
import type { CodeAction, CompletionList, Hover } from '@volar/language-service';
import { CompletionItemKind } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import type { TextEdit } from '../json-edit.js';
import { turnOffEdit } from './config-edits.js';

/** How a comment opens and closes where the bulb writes it; `close` is empty for a line comment. */
export interface CommentDelimiters {
  readonly open: string;
  readonly close: string;
}

export const RAZOR_COMMENT: CommentDelimiters = { open: '@*', close: '*@' };
export const CSS_COMMENT: CommentDelimiters = { open: '/*', close: '*/' };
export const SCRIPT_COMMENT: CommentDelimiters = { open: '//', close: '' };
export const HASH_COMMENT: CommentDelimiters = { open: '#', close: '' };

/** The `fudic.json` a file obeys, as the bulb that writes in it needs it. */
export interface ConfigFile {
  readonly path: string;
  readonly text: string;
}

/**
 * The client command that leaves the cursor where the author writes next (`fudic-vscode`): after a
 * bulb wrote a `fud-disable` comment, on its reason. Arguments: the file's uri, line, character.
 */
export const PLACE_CURSOR_COMMAND = 'fudic.placeCursor';

/** One way to write a comment: the edit of the file and, when the author must write the reason, how far into the new line it goes. */
interface SilenceFix {
  readonly title: string;
  readonly edit: TextEdit;
  readonly cursor?: number;
}

/** A directive already written: where its list of codes is, and the codes in it. */
interface WrittenDirective {
  readonly codes: readonly { readonly code: string; readonly span: Span }[];
}

const DIRECTIVE = /(@\*|\/\*+|\/\/|#)(\s*)fud-disable(-next-line)?(\s+)([^:\n]*?)\s*:/u;

/** The directive written on the line starting at `lineStart`, when it is one of `scope`. */
function directiveOn(text: string, lineStart: number, scope: 'file' | 'next-line'): WrittenDirective | undefined {
  const end = lineEnd(text, lineStart);
  const found = DIRECTIVE.exec(text.slice(lineStart, end));
  if (found === null || (found[3] !== undefined) !== (scope === 'next-line')) return undefined;
  return { codes: codesIn(found[5]!, lineStart + found.index + found[0].indexOf(found[5]!, found[1]!.length)) };
}

/** The codes of a written list, each with its span; `at` is where the list starts. */
function codesIn(list: string, at: number): { readonly code: string; readonly span: Span }[] {
  return [...list.matchAll(/[^,\s]+/gu)].map((m) => ({ code: m[0], span: { start: at + m.index, end: at + m.index + m[0].length } }));
}

/** The code added to a directive already there: after its last code. */
function joined(directive: WrittenDirective, code: string): TextEdit {
  const last = directive.codes[directive.codes.length - 1]!;
  return { span: { start: last.span.end, end: last.span.end }, newText: `, ${code}` };
}

/**
 * «Silence FUDnnnn on this line» and «… in this file» for a diagnostic starting at `at`. `line` is
 * how a comment is written on the line above it, `file` at the top of the file. A directive of the
 * same scope already there gains the code instead: a second comment on the line above would be the
 * line the first one silences.
 */
function silenceFixes(text: string, at: number, code: FudCode, line: CommentDelimiters, file: CommentDelimiters): SilenceFix[] {
  const start = lineStart(text, at);
  const above = start === 0 ? undefined : directiveOn(text, lineStart(text, start - 1), 'next-line');
  const indent = /^[ \t]*/u.exec(text.slice(start))![0];
  const lineFix: SilenceFix =
    above === undefined
      ? written(`${indent}${line.open} fud-disable-next-line ${code}: `, line, start)
      : { title: '', edit: joined(above, code) };
  const top = fileDirective(text);
  const fileFix: SilenceFix = top === undefined ? written(`${file.open} fud-disable ${code}: `, file, 0) : { title: '', edit: joined(top, code) };
  return [
    { ...lineFix, title: `Silence ${code} on this line` },
    { ...fileFix, title: `Silence ${code} in this file` },
  ];
}

/** A new comment, `head` up to the reason, inserted as a line of its own at `at`. */
function written(head: string, delimiters: CommentDelimiters, at: number): SilenceFix {
  const tail = delimiters.close === '' ? '' : ` ${delimiters.close}`;
  return { title: '', edit: { span: { start: at, end: at }, newText: `${head}${tail}\n` }, cursor: head.length };
}

/** The first file-wide directive of the text, wherever it is. */
function fileDirective(text: string): WrittenDirective | undefined {
  for (let start = 0; start < text.length; start = lineEnd(text, start) + 1) {
    const found = directiveOn(text, start, 'file');
    if (found !== undefined) return found;
  }
  return undefined;
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1;
}

function lineEnd(text: string, offset: number): number {
  const end = text.indexOf('\n', offset);
  return end < 0 ? text.length : end;
}

/**
 * The codes of a `fud-disable` comment at `span` taken out: the whole comment when none is left —
 * its line too, when the comment is alone on it — or the codes from its list otherwise.
 */
export function removeCodesEdit(text: string, span: Span, codes: readonly string[]): TextEdit | undefined {
  const found = DIRECTIVE.exec(text.slice(span.start, span.end));
  if (found === null) return undefined;
  const listAt = span.start + found.index + found[0].indexOf(found[5]!, found[1]!.length);
  const written = codesIn(found[5]!, listAt);
  const kept = written.filter((entry) => !codes.includes(entry.code));
  if (kept.length > 0) {
    return { span: { start: written[0]!.span.start, end: written[written.length - 1]!.span.end }, newText: kept.map((k) => k.code).join(', ') };
  }
  const start = lineStart(text, span.start);
  const end = lineEnd(text, span.end);
  const alone = text.slice(start, span.start).trim() === '' && text.slice(span.end, end).trim() === '';
  return alone ? { span: { start, end: Math.min(end + 1, text.length) }, newText: '' } : { span, newText: '' };
}

/** A diagnostic as the bulbs read it: the code, where it starts, and the message some of them parse. */
export interface ShownDiagnostic {
  readonly code: FudCode;
  readonly span: Span;
  readonly message: string;
}

/** What the bulbs over one document need. */
export interface SilenceTarget {
  /** The uri the edits of this document go to (Volar maps it back to the file). */
  readonly uri: string;
  /** The file on disk, for the cursor command. */
  readonly path: string;
  readonly text: string;
  /** How a comment is written on a line of its own before the line that starts at this offset. */
  lineDelimiters(offset: number): CommentDelimiters;
  /** How it is written at the top of the file. */
  readonly fileDelimiters: CommentDelimiters;
  /** The `fudic.json` the file obeys; absent with none, and then nothing is turned off in the project. */
  readonly config?: ConfigFile;
}

/** The codes about the comments themselves: what the bulbs take out, and what a comment cannot usefully silence. */
const COMMENT_CODES = { unknown: 'FUD1520', refused: 'FUD1521', unused: 'FUD1523' } as const;

const ABOUT_COMMENTS: ReadonlySet<string> = new Set([COMMENT_CODES.unknown, COMMENT_CODES.unused]);

/** Whether the bulbs may silence `code`: a code that is a warning, info or hint by default. */
export function silenceable(code: FudCode): boolean {
  const info = codeInfo(code);
  return info !== undefined && !('retired' in info) && info.severity !== 'error';
}

/**
 * The bulbs of the comments over `diagnostics`, the ones shown: silence a code on its line, in the
 * file or in the project, and take out what a comment says to no effect (`FUD1521`, `FUD1523`).
 */
export function suppressionActions(target: SilenceTarget, diagnostics: readonly ShownDiagnostic[]): CodeAction[] {
  const actions: CodeAction[] = [];
  const doc = TextDocument.create(target.uri, 'plain', 0, target.text);
  const edit = (title: string, change: TextEdit, cursor?: number): CodeAction => ({
    title,
    kind: 'quickfix',
    diagnostics: [],
    edit: { changes: { [target.uri]: [toLsp(doc, change)] } },
    ...(cursor === undefined ? {} : { command: placeCursor(target, doc, cursor, change) }),
  });
  for (const diagnostic of diagnostics) {
    if (diagnostic.code === COMMENT_CODES.unused || diagnostic.code === COMMENT_CODES.refused) {
      const removal =
        diagnostic.code === COMMENT_CODES.unused
          ? removeCodesEdit(target.text, diagnostic.span, unusedCodes(diagnostic.message))
          : removeCodeAt(target.text, diagnostic.span);
      if (removal !== undefined) actions.push(edit('Remove', removal));
    }
    if (!silenceable(diagnostic.code) || ABOUT_COMMENTS.has(diagnostic.code)) continue;
    // The region the diagnostic's line starts in is the one a new line above it opens in.
    const start = lineStart(target.text, diagnostic.span.start);
    for (const fix of silenceFixes(target.text, diagnostic.span.start, diagnostic.code, target.lineDelimiters(start), target.fileDelimiters)) {
      actions.push(edit(fix.title, fix.edit, fix.cursor));
    }
    const off = target.config === undefined ? undefined : turnOffAction(target.config, diagnostic.code);
    if (off !== undefined) actions.push(off);
  }
  return actions;
}

/** «Turn FUDnnnn off in the project»: its entry in the `diagnostics` of `config`. */
export function turnOffAction(config: ConfigFile, code: FudCode): CodeAction | undefined {
  const change = turnOffEdit(config.text, code);
  return change === undefined ? undefined : configAction(`Turn ${code} off in the project`, config, change);
}

/** An action that edits a `fudic.json` on disk, which is not the document being edited. */
export function configAction(title: string, config: ConfigFile, change: TextEdit): CodeAction {
  const doc = TextDocument.create(URI.file(config.path).toString(), 'json', 0, config.text);
  return { title, kind: 'quickfix', diagnostics: [], edit: { changes: { [doc.uri]: [toLsp(doc, change)] } } };
}

function toLsp(doc: TextDocument, change: TextEdit): { range: { start: ReturnType<TextDocument['positionAt']>; end: ReturnType<TextDocument['positionAt']> }; newText: string } {
  return { range: { start: doc.positionAt(change.span.start), end: doc.positionAt(change.span.end) }, newText: change.newText };
}

/** The cursor `column` characters into the line `change` inserted, once it is in the text. */
function placeCursor(target: SilenceTarget, doc: TextDocument, column: number, change: TextEdit) {
  const line = doc.positionAt(change.span.start).line;
  return { title: 'Write the reason', command: PLACE_CURSOR_COMMAND, arguments: [URI.file(target.path).toString(), line, column] };
}

/** The code of a comment written at `span` (a `FUD1521`) taken out of it. */
function removeCodeAt(text: string, span: Span): TextEdit | undefined {
  const comment = commentAroundCode(text, span);
  return comment === undefined ? undefined : removeCodesEdit(text, comment, [text.slice(span.start, span.end)]);
}

/** The comment around the code a `FUD1521` points at: from its opener to its closer, or to the end of the line. */
function commentAroundCode(text: string, span: Span): Span | undefined {
  const start = lineStart(text, span.start);
  const end = lineEnd(text, span.start);
  const found = DIRECTIVE.exec(text.slice(start, end));
  if (found === null) return undefined;
  const closer = found[1] === '@*' ? '*@' : found[1]!.startsWith('/*') ? '*/' : '';
  return { start: start + found.index, end: closer === '' ? end : text.indexOf(closer, span.end) + closer.length };
}

/** The codes of a `FUD1523` message, which are the ones the comment silenced nothing with. */
export function unusedCodes(message: string): string[] {
  return /nothing to silence: (.*?) (?:does|do) not occur/u.exec(message)?.[1]!.split(', ') ?? [];
}

/** Where the author is writing codes in a `fud-disable` comment: the start of the code being written. */
export interface CodeSlot {
  readonly start: number;
  readonly scope: 'file' | 'next-line';
  /** The 0-based line the comment is on. */
  readonly line: number;
}

const SLOT = /(?:@\*|\/\*+|\/\/|#)\s*fud-disable(-next-line)?\s+(?:FUD\d{4}\s*,\s*)*([A-Z0-9]*)$/u;

/** The code slot at `offset`, or `undefined` when the cursor is not after the keyword of a directive. */
export function codeSlotAt(text: string, offset: number): CodeSlot | undefined {
  const start = lineStart(text, offset);
  const found = SLOT.exec(text.slice(start, offset));
  if (found === null) return undefined;
  return {
    start: offset - found[2]!.length,
    scope: found[1] === undefined ? 'file' : 'next-line',
    line: text.slice(0, start).split('\n').length - 1,
  };
}

/** One completion of a code: the code, its title and severity, and its place in the list. */
export interface CodeCompletion {
  readonly code: FudCode;
  readonly detail: string;
  readonly sortText: string;
}

/**
 * The codes a directive can name, those that occur where it applies first (`nearby`), then the rest;
 * only codes the comment can silence, since an error in it is `FUD1521`.
 */
export function codeCompletions(nearby: readonly FudCode[]): CodeCompletion[] {
  return liveCodes()
    .filter((info) => info.severity !== 'error')
    .map((info) => ({
      code: info.code,
      detail: `${info.severity} — ${info.title}`,
      sortText: `${nearby.includes(info.code) ? '0' : '1'}${info.code}`,
    }));
}

/** The hover over a code written in a `fud-disable` comment: its title, and how this project reports it. */
export function codeHoverAt(text: string, offset: number, policy: Policy | null): { readonly span: Span; readonly markdown: string } | undefined {
  const start = lineStart(text, offset);
  const found = DIRECTIVE.exec(text.slice(start, lineEnd(text, offset)));
  if (found === null) return undefined;
  const listAt = start + found.index + found[0].indexOf(found[5]!, found[1]!.length);
  const entry = codesIn(found[5]!, listAt).find((e) => e.span.start <= offset && offset <= e.span.end);
  const info = entry === undefined ? undefined : codeInfo(entry.code);
  if (entry === undefined || info === undefined) return undefined;
  if ('retired' in info) {
    const by = info.replacedBy.length === 0 ? '' : `: replaced by ${info.replacedBy.join(', ')}`;
    return { span: entry.span, markdown: `**${info.code}** — ${info.title}\n\nRetired${by}.` };
  }
  const level = reportedLevel(info.code, info.severity, policy);
  const how = level === info.severity ? `${info.severity}` : `${info.severity} by default; ${level} in this project`;
  return { span: entry.span, markdown: `**${info.code}** — ${info.title}\n\n${how[0]!.toUpperCase()}${how.slice(1)}.` };
}

/** The codes of `diagnostics` where the directive at `slot` applies: the next line, or the whole file. */
export function nearbyCodes(slot: CodeSlot, text: string, diagnostics: readonly { readonly code: FudCode; readonly span: Span }[]): FudCode[] {
  const lines = TextDocument.create('', 'plain', 0, text);
  return diagnostics.filter((d) => slot.scope === 'file' || lines.positionAt(d.span.start).line === slot.line + 1).map((d) => d.code);
}

/** The completion of the code being written at `offset` of `document`, or `undefined` when no code is. */
export function codeCompletionList(
  document: TextDocument,
  offset: number,
  codesNear: (slot: CodeSlot) => readonly FudCode[],
): CompletionList | undefined {
  const slot = codeSlotAt(document.getText(), offset);
  if (slot === undefined) return undefined;
  const range = { start: document.positionAt(slot.start), end: document.positionAt(offset) };
  return {
    isIncomplete: false,
    items: codeCompletions(codesNear(slot)).map((c) => ({
      label: c.code,
      kind: CompletionItemKind.Constant,
      detail: c.detail,
      sortText: c.sortText,
      textEdit: { range, newText: c.code },
    })),
  };
}

/** The hover over a code in a `fud-disable` comment of `document`, as LSP. */
export function codeHover(document: TextDocument, offset: number, policy: Policy | null): Hover | undefined {
  const found = codeHoverAt(document.getText(), offset, policy);
  if (found === undefined) return undefined;
  return {
    contents: { kind: 'markdown', value: found.markdown },
    range: { start: document.positionAt(found.span.start), end: document.positionAt(found.span.end) },
  };
}

/** A file whose comments are `#` lines (a `.fudapi`, a `.fudspec`), as its comment bulbs see it. */
export interface HashFile {
  readonly uri: string;
  readonly path: string;
  readonly text: string;
  readonly config?: ConfigFile;
}

/** The comment bulbs of a file whose comments are `#` lines, over what it shows between `start` and `end`. */
export function hashFileActions(file: HashFile, shown: readonly ShownDiagnostic[], start: number, end: number): CodeAction[] {
  const here = shown.filter((d) => d.span.start <= end && start <= d.span.end);
  return suppressionActions({ ...file, lineDelimiters: () => HASH_COMMENT, fileDelimiters: HASH_COMMENT }, here);
}
