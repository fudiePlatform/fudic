/**
 * Where the cursor is in a `.headers` file (SDD-84 §3.2): on a header's name, in its value, or in a
 * line that continues it — and, in a value, what is being written there. Read off the text around
 * the cursor and not off the parse, because the line being typed is usually the one that does not
 * parse yet.
 */

import {
  CACHE_CONTROL_DIRECTIVES,
  CSP_KEYWORDS,
  KNOWN_HEADERS,
  NONCE_SOURCE,
  SOURCE_LIST_DIRECTIVES,
  type HeadersKind,
} from '@fudic/config';
import type { Span } from '@fudic/diagnostics';
import { directiveHover, headerHover } from './docs.js';

/** One line of the file, as the cursor's position needs it. */
interface Line {
  readonly start: number;
  readonly end: number;
  readonly indent: number;
  /** Without the indentation; `''` for a blank line. */
  readonly body: string;
}

/** What a line is in its file. */
type Role =
  | { readonly role: 'header' }
  | { readonly role: 'continuation'; readonly owner: Line }
  | { readonly role: 'other' };

/** A header token (RFC 9110) and its colon, at the start of a line's body. */
const HEADER = /^([!#$%&'*+\-.^_`|~0-9A-Za-z]+):/u;

function lineAt(text: string, offset: number): Line {
  const start = text.lastIndexOf('\n', offset - 1) + 1;
  const newline = text.indexOf('\n', offset);
  const end = newline < 0 ? text.length : newline;
  const raw = text.slice(start, end).replace(/\r$/u, '');
  const body = raw.trimStart();
  return { start, end, indent: raw.length - body.length, body: body.trimEnd() };
}

/** The lines before the one starting at `start`, nearest first, without the blank ones and the comments. */
function* before(text: string, start: number): Generator<Line> {
  for (let at = start; at > 0; ) {
    const line = lineAt(text, at - 1);
    at = line.start;
    if (line.body !== '' && !line.body.startsWith('#')) yield line;
  }
}

/** What `line` is: a header, the continuation of one, or neither (a comment, a path, a line out of place). */
function roleOf(kind: HeadersKind, text: string, line: Line): Role {
  if (line.body.startsWith('#')) return { role: 'other' };
  if (kind !== 'assets') {
    if (line.indent === 0) return { role: 'header' };
    const owner = [...before(text, line.start)].find((l) => l.indent === 0);
    return owner === undefined ? { role: 'other' } : { role: 'continuation', owner };
  }
  if (line.indent === 0) return { role: 'other' };
  // Back to the path of the block: the first line after it sets the indentation of its headers.
  const block: Line[] = [];
  for (const previous of before(text, line.start)) {
    if (previous.indent === 0) {
      if (!previous.body.startsWith('/')) return { role: 'other' };
      break;
    }
    block.push(previous);
  }
  const indent = block.at(-1)?.indent ?? line.indent;
  if (line.indent <= indent) return { role: 'header' };
  return { role: 'continuation', owner: block.find((l) => l.indent <= indent)! };
}

/** What is being written at the cursor. `start` is where the word being written starts. */
export type HeadersSlot =
  | { readonly kind: 'name'; readonly start: number }
  | { readonly kind: 'directive'; readonly start: number }
  | { readonly kind: 'source'; readonly start: number; readonly directive: string }
  | { readonly kind: 'value'; readonly start: number; readonly values: readonly string[] };

/** The slot at `offset`, or undefined where nothing is completed: a comment, a path, an unknown header's value. */
export function slotAt(kind: HeadersKind, text: string, offset: number): HeadersSlot | undefined {
  const line = lineAt(text, offset);
  const prefix = text.slice(line.start, offset);
  const start = offset - /[^\s;,:]*$/u.exec(prefix)![0].length;
  const role = roleOf(kind, text, line);
  if (role.role === 'other') return undefined;
  if (role.role === 'header') {
    const colon = prefix.indexOf(':');
    if (colon < 0) return { kind: 'name', start };
    return valueSlot(prefix.slice(0, colon), prefix.slice(colon + 1), start);
  }
  const owner = HEADER.exec(role.owner.body);
  return owner === null ? undefined : valueSlot(owner[1]!, prefix, start);
}

function valueSlot(name: string, value: string, start: number): HeadersSlot | undefined {
  const lower = name.trim().toLowerCase();
  if (lower === 'content-security-policy') {
    const part = value.slice(value.lastIndexOf(';') + 1).trimStart();
    const words = part.split(/\s+/u);
    return words.length === 1 ? { kind: 'directive', start } : { kind: 'source', start, directive: words[0]!.toLowerCase() };
  }
  if (lower === 'cache-control') return { kind: 'value', start, values: CACHE_CONTROL_DIRECTIVES };
  const values = KNOWN_HEADERS.get(lower)?.values;
  return values === undefined ? undefined : { kind: 'value', start, values };
}

/** What a directive's value can be written with, as the completion offers it. */
export function sourcesFor(kind: HeadersKind, directive: string): readonly string[] {
  if (directive === 'require-trusted-types-for') return ["'script'"];
  if (directive === 'trusted-types') return ['fudic', "'allow-duplicates'", "'none'"];
  if (directive === 'webrtc') return ["'allow'", "'block'"];
  if (!SOURCE_LIST_DIRECTIVES.includes(directive)) return [];
  // The nonce only where it is filled: in the page's policy.
  return [...(kind === 'page' ? [NONCE_SOURCE] : []), ...CSP_KEYWORDS, 'https:', 'data:', 'blob:'];
}

/** The hover at `offset`: a header's name, or a directive of a CSP. */
export function hoverAt(kind: HeadersKind, text: string, offset: number): { readonly span: Span; readonly markdown: string } | undefined {
  const line = lineAt(text, offset);
  const role = roleOf(kind, text, line);
  if (role.role === 'other') return undefined;
  const own = role.role === 'header' ? line : role.owner;
  const name = HEADER.exec(own.body)?.[1];
  if (name === undefined) return undefined;
  const nameStart = own.start + own.indent;
  if (role.role === 'header' && offset <= nameStart + name.length) {
    const markdown = headerHover(name);
    return markdown === undefined ? undefined : { span: { start: nameStart, end: nameStart + name.length }, markdown };
  }
  if (name.toLowerCase() !== 'content-security-policy') return undefined;
  const left = /[A-Za-z-]*$/u.exec(text.slice(line.start, offset))![0].length;
  const right = /^[A-Za-z-]*/u.exec(text.slice(offset, line.end))![0].length;
  const span = { start: offset - left, end: offset + right };
  const markdown = directiveHover(text.slice(span.start, span.end));
  return markdown === undefined ? undefined : { span, markdown };
}
