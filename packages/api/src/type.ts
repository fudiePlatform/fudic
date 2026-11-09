/**
 * The small grammars that live inside one token or a few: types, literals, routes and
 * durations. Each reads what it is given, reports once what does not fit, and never throws.
 */

import { FUD1067, FUD1068, span, type FUD1068Kind, type SourceDiagnostic, type Span } from '@fudic/diagnostics';
import type {
  Duration,
  Literal,
  NumberLiteral,
  Route,
  RouteSegment,
  StringLiteral,
  TypeExpr,
} from './ast.js';
import { isString, stringText, type Token } from './line.js';
import { durationMs } from './load-options.js';

/** A name, its `[]`s and its `?`. `*` is any type: the validator only takes it in `on field`. */
const NAMED = /^([A-Za-z_][A-Za-z0-9_]*|\*)((?:\[\])*)(\?)?$/u;

/** A type that fits in one token: `str`, `Person[]`, `i32?`. */
function singleType(t: Token): TypeExpr | undefined {
  const m = NAMED.exec(t.raw);
  if (m === null) return undefined;
  const start = t.span.start;
  const base = m[1]!;
  let type: TypeExpr = { kind: 'named', name: { text: base, span: span(start, start + base.length) }, span: span(start, start + base.length) };
  let at = start + base.length;
  for (let i = 0; i < m[2]!.length / 2; i++) {
    at += 2;
    type = { kind: 'list', element: type, span: span(start, at) };
  }
  if (m[3] !== undefined) type = { kind: 'optional', inner: type, span: span(start, at + 1) };
  return type;
}

/**
 * The type that starts at `tokens[0]`, and how many tokens it took. `map K V` takes three or
 * more (its value may be a map); anything else, one. Nothing to read reports `FUD1067` over
 * what there was, and answers `undefined` having taken it all.
 */
export function readType(
  tokens: readonly Token[],
  out: SourceDiagnostic[],
): { readonly type?: TypeExpr; readonly used: number } {
  const first = tokens[0];
  if (first === undefined) return { used: 0 };
  if (first.raw === 'map') {
    const key = tokens[1] !== undefined ? singleType(tokens[1]) : undefined;
    const value = key !== undefined && tokens.length > 2 ? readType(tokens.slice(2), []) : { used: 0 };
    if (key === undefined || value.type === undefined) {
      const whole = span(first.span.start, tokens[tokens.length - 1]!.span.end);
      out.push(FUD1067({ span: whole, text: tokens.map((t) => t.raw).join(' ') }));
      return { used: tokens.length };
    }
    return {
      type: { kind: 'map', keyword: first.span, key, value: value.type, span: span(first.span.start, value.type.span.end) },
      used: 2 + value.used,
    };
  }
  const type = singleType(first);
  if (type === undefined) {
    out.push(FUD1067({ span: first.span, text: first.raw }));
    return { used: 1 };
  }
  return { type, used: 1 };
}

/** A string token as a literal, or `undefined` for any other token. */
export function stringLiteral(t: Token): StringLiteral | undefined {
  return isString(t) ? { kind: 'string', text: stringText(t), span: t.span } : undefined;
}

const NUMBER = /^-?\d+(?:\.\d+)?$/u;

/** A number with a unit stuck to it: a size. */
const SIZE = /^(\d+(?:\.\d+)?)(kb|mb|gb)$/u;

/** What looks like a size with a unit that is not one (`FUD1487`): digits, then letters. */
export const SIZE_LIKE = /^\d+(?:\.\d+)?[a-z]+$/iu;

/** Bytes per unit, base 1024: what a file system shows the user who chooses the file. */
const UNITS: Readonly<Record<string, number>> = { kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };

/** Any token as the literal it reads as. A token always reads as something: a word, at worst. */
export function literal(t: Token): Literal {
  const str = stringLiteral(t);
  if (str !== undefined) return str;
  if (NUMBER.test(t.raw)) return { kind: 'number', value: Number(t.raw), span: t.span };
  // A size, in base 1024 and whole bytes (SDD-81 §3.2): `2mb`, `500kb`, `1.5gb`.
  const size = SIZE.exec(t.raw.toLowerCase());
  if (size !== null) return { kind: 'number', value: Math.floor(Number(size[1]) * UNITS[size[2]!]!), span: t.span };
  if (t.raw === 'true' || t.raw === 'false') return { kind: 'bool', value: t.raw === 'true', span: t.span };
  if (t.raw === '[]') return { kind: 'empty-list', span: t.span };
  return { kind: 'word', text: t.raw, span: t.span };
}

/** An initial value: a string, a number, a boolean or `[]` (`FUD1068` otherwise). */
export function initialValue(t: Token, out: SourceDiagnostic[]): Literal | undefined {
  const value = literal(t);
  if (value.kind !== 'word') return value;
  return malformed(t, 'value', out);
}

/** A whole number: a status, a size (`FUD1068` with `kind` otherwise). */
export function wholeNumber(
  t: Token,
  kind: 'status' | 'number',
  out: SourceDiagnostic[],
): NumberLiteral | undefined {
  return /^\d+$/u.test(t.raw) ? { kind: 'number', value: Number(t.raw), span: t.span } : malformed(t, kind, out);
}

/** A string where a text goes (`FUD1068` otherwise). */
export function text(t: Token, out: SourceDiagnostic[]): StringLiteral | undefined {
  return stringLiteral(t) ?? malformed(t, 'text', out);
}

function malformed(t: Token, kind: FUD1068Kind, out: SourceDiagnostic[]): undefined {
  out.push(FUD1068({ span: t.span, text: t.raw, kind }));
  return undefined;
}

const SEGMENT = /^(?::([A-Za-z_][A-Za-z0-9_]*)|([a-z0-9-]+))$/u;

/** `/:id/lines/:line`, the route of a function (`FUD1068` otherwise). */
export function route(t: Token, out: SourceDiagnostic[]): Route | undefined {
  if (!t.raw.startsWith('/')) return malformed(t, 'route', out);
  const segments: RouteSegment[] = [];
  let at = t.span.start + 1;
  for (const raw of t.raw.slice(1).split('/')) {
    const m = SEGMENT.exec(raw);
    if (m === null) return malformed(t, 'route', out);
    segments.push({
      kind: m[1] !== undefined ? 'param' : 'literal',
      text: m[1] ?? m[2]!,
      span: span(at, at + raw.length),
    });
    at += raw.length + 1;
  }
  return { segments, span: t.span };
}

/** `5m`, or `undefined` when the token is not a duration. Reports nothing: the caller knows why. */
export function duration(t: Token): Duration | undefined {
  const ms = durationMs(t.raw);
  return ms === undefined ? undefined : { text: t.raw, ms, span: t.span };
}

/** The span from the first to the last of `tokens`, which is never empty. */
export function cover(tokens: readonly Token[]): Span {
  return span(tokens[0]!.span.start, tokens[tokens.length - 1]!.span.end);
}
