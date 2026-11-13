/**
 * The checks of the headers fudic knows, other than the CSP: each one says what its header
 * accepts and points at the part that does not.
 */

import { FUD1543, FUD1549, FUD1550, type FileDiagnostic } from '@fudic/diagnostics';
import { partsOf, type Piece, type ValueCtx } from './segments.js';

export const COOP_VALUES = ['same-origin', 'same-origin-allow-popups', 'noopener-allow-popups', 'unsafe-none'] as const;

export const REFERRER_VALUES = [
  'no-referrer',
  'no-referrer-when-downgrade',
  'origin',
  'origin-when-cross-origin',
  'same-origin',
  'strict-origin',
  'strict-origin-when-cross-origin',
  'unsafe-url',
] as const;

/** The referrer policies that do not send the path within the origin, which `back` reads. */
const REFERRER_WITHOUT_PATH: ReadonlySet<string> = new Set(['no-referrer', 'origin', 'strict-origin']);

/** The response directives of `Cache-Control`: `number` takes seconds, `fields` may take a list, `flag` takes nothing. */
const CACHE_DIRECTIVES: ReadonlyMap<string, 'number' | 'fields' | 'flag'> = new Map([
  ['max-age', 'number'],
  ['s-maxage', 'number'],
  ['stale-while-revalidate', 'number'],
  ['stale-if-error', 'number'],
  ['no-cache', 'fields'],
  ['private', 'fields'],
  ['no-store', 'flag'],
  ['no-transform', 'flag'],
  ['must-revalidate', 'flag'],
  ['proxy-revalidate', 'flag'],
  ['must-understand', 'flag'],
  ['public', 'flag'],
  ['immutable', 'flag'],
]);

/** A value that is one of `values`, maybe with parameters after `;` (`same-origin; report-to="x"`). */
export function oneOf(values: readonly string[]): (ctx: ValueCtx) => readonly FileDiagnostic[] {
  return (ctx) => {
    const value = ctx.segments[0]!;
    const token = value.text.split(';')[0]!.trim();
    return values.includes(token) ? [] : [wrong(ctx, value, values.join(', '))];
  };
}

/** `Referrer-Policy`: a list of policies, the last one the browser knows wins. */
export function referrerPolicy(ctx: ValueCtx): readonly FileDiagnostic[] {
  const parts = partsOf(ctx.segments, ',');
  const bad = parts.filter((part) => !(REFERRER_VALUES as readonly string[]).includes(part.text));
  if (bad.length > 0) return bad.map((part) => wrong(ctx, part, REFERRER_VALUES.join(', ')));
  const last = parts.at(-1)!;
  return REFERRER_WITHOUT_PATH.has(last.text) ? [FUD1549({ file: ctx.file, span: last.span, value: last.text })] : [];
}

/** `Strict-Transport-Security`: `max-age=N` first, then `includeSubDomains` and `preload`. */
export function strictTransportSecurity(ctx: ValueCtx): readonly FileDiagnostic[] {
  const out: FileDiagnostic[] = [];
  const expected = 'max-age=<seconds>, and includeSubDomains and preload if wanted';
  let maxAge: number | undefined;
  let subdomains = false;
  let preload: Piece | undefined;
  for (const part of partsOf(ctx.segments, ';')) {
    const age = /^max-age\s*=\s*(?:(\d+)|"(\d+)")$/iu.exec(part.text);
    const lower = part.text.toLowerCase();
    if (age !== null) maxAge = Number(age[1] ?? age[2]);
    else if (lower === 'includesubdomains') subdomains = true;
    else if (lower === 'preload') preload = part;
    else out.push(wrong(ctx, part, expected));
  }
  if (maxAge === undefined) out.push(FUD1543({ file: ctx.file, span: ctx.nameSpan, name: ctx.entry.name, value: ctx.entry.value, expected }));
  if (preload !== undefined && maxAge !== undefined && maxAge < 31536000) {
    out.push(FUD1550({ file: ctx.file, span: preload.span, problem: 'max-age' }));
  }
  if (preload !== undefined && !subdomains) out.push(FUD1550({ file: ctx.file, span: preload.span, problem: 'subdomains' }));
  return out;
}

/** `Cache-Control`: response directives, with their number when they take one. */
export function cacheControl(ctx: ValueCtx): readonly FileDiagnostic[] {
  const out: FileDiagnostic[] = [];
  for (const part of partsOf(ctx.segments, ',')) {
    const [, name = '', argument] = /^([^=]*?)\s*(?:=\s*(.*))?$/u.exec(part.text)!;
    const shape = CACHE_DIRECTIVES.get(name.toLowerCase());
    const fine =
      shape === 'number'
        ? argument !== undefined && /^(?:\d+|"\d+")$/u.test(argument)
        : shape === 'fields'
          ? argument === undefined || /^"[^"]*"$/u.test(argument)
          : shape === 'flag' && argument === undefined;
    if (!fine) out.push(wrong(ctx, part, cacheExpected(shape, name)));
  }
  return out;
}

function cacheExpected(shape: 'number' | 'fields' | 'flag' | undefined, name: string): string {
  if (shape === 'number') return `${name}=<seconds>`;
  if (shape === 'fields') return `${name}, or ${name}="<header names>"`;
  if (shape === 'flag') return `${name} without a value`;
  return `a response directive: ${[...CACHE_DIRECTIVES.keys()].join(', ')}`;
}

const KEY = '[a-z*][a-z0-9_\\-.*]*';
const ITEM = `(?:"[^"\\\\]*"|[A-Za-z*][A-Za-z0-9:/!#$%&'*+\\-.^_\`|~]*|-?\\d+(?:\\.\\d+)?|\\?[01])`;
const INNER = `\\((?:\\s*${ITEM})*\\s*\\)`;
const PARAMS = `(?:;${KEY}(?:=${ITEM})?)*`;
const MEMBER = new RegExp(`^${KEY}(?:=(?:${INNER}|${ITEM}))?${PARAMS}$`, 'u');

/** `Permissions-Policy`: a structured dictionary (RFC 8941), `feature=(allowlist)`. */
export function permissionsPolicy(ctx: ValueCtx): readonly FileDiagnostic[] {
  return partsOf(ctx.segments, ',')
    .filter((part) => !MEMBER.test(part.text))
    .map((part) => wrong(ctx, part, 'feature=(allowlist), such as camera=() or geolocation=(self)'));
}

function wrong(ctx: ValueCtx, part: Piece, expected: string): FileDiagnostic {
  return FUD1543({ file: ctx.file, span: part.span, name: ctx.entry.name, value: part.text, expected });
}
