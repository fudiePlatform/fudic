/**
 * Sentinels for the fragments that are not programs (SDD-26 §4.2).
 *
 * `@(a ? b : c)` is not a program and `@if (x > 0)` is not one either. To format them with
 * a real JS formatter they have to be WRAPPED into something parseable, formatted, and
 * UNWRAPPED again. The wrapper is the whole trick, and getting it wrong is silent: a
 * sentinel that leaks into the output writes code the user never typed.
 *
 * If a fragment does not parse it is left exactly as written and the file goes on being
 * formatted (§4.2). While a header is being typed it is broken by definition, and that is
 * precisely when the editor asks to format.
 */

import { scanParens } from '@fudic/compiler';
import type { LeafEngine } from './engine.js';
import type { ResolvedOptions } from '../types.js';

/**
 * The shapes of §4.2, collapsed to the wrappers that actually differ.
 *
 * `@if` and `@while` share one, `@for` and `@foreach` share another: what the sentinel has
 * to produce is a parseable statement, and both pairs produce the same one.
 */
export type JsFragmentKind =
  /** `@(…)`, an implicit `@expr`, a binding value, a `case` test. */
  | 'expression'
  /** The header of `@if` / `@while`. */
  | 'condition'
  /** The header of `@for` / `@foreach`. */
  | 'iteration'
  /** The discriminant of `@switch`. */
  | 'discriminant'
  /** `@code`, `@server`, `@client`, `@{ … }` — already a list of statements. */
  | 'statements';

const WRAPPERS: Readonly<Record<JsFragmentKind, readonly [string, string]>> = {
  expression: ['(', ');'],
  condition: ['if (', ') {}'],
  iteration: ['for (', ') {}'],
  discriminant: ['switch (', ') {}'],
  statements: ['', ''],
};

/** Wrap a fragment into a parseable program. */
export function wrapFragment(kind: JsFragmentKind, source: string): string {
  const [open, close] = WRAPPERS[kind];
  return `${open}${source}${close}`;
}

/**
 * Remove the base indentation the wrapper introduced, keeping the relative shape.
 *
 * The formatter indents against column zero, which is where the wrapper starts, so most
 * fragments come back with nothing to remove. The exception is a header the formatter chose
 * to break right after the `(`: then every line of the body carries one level that belongs
 * to the sentinel and not to the user's code.
 */
export function dedent(text: string): string {
  const lines = text.split('\n');
  while (lines.length > 0 && lines[0]!.trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') lines.pop();
  if (lines.length === 0) return '';

  let base = Number.POSITIVE_INFINITY;
  for (const l of lines) {
    if (l.trim() === '') continue;
    base = Math.min(base, l.length - l.trimStart().length);
  }
  // `trimEnd` as well: a fragment sliced out of the source carries the space that separated
  // it from its closing brace, and `@{ const a = 1; }` would come back with two.
  return lines
    .map((l) => l.slice(Math.min(base, l.length - l.trimStart().length)).trimEnd())
    .join('\n');
}

/**
 * Take the wrapper back off.
 *
 * Only ever called on output the engine accepted, so the wrapper is there by construction:
 * a program that parsed as `if ( … ) {}` still contains its parenthesis. The one shape that
 * is not guaranteed is the expression's trailing `;` — an expression carrying a trailing
 * block comment comes back as `x; // the comment`, with the semicolon in the middle — and
 * in that case the fragment is returned untouched rather than guessed at. Losing a
 * character of the user's code is not worth a prettier ternary.
 */
export function unwrapFragment(
  kind: JsFragmentKind,
  formatted: string,
  original: string,
): string {
  if (kind === 'statements') return dedent(formatted);

  const text = formatted.trimEnd();

  if (kind === 'expression') {
    if (!text.endsWith(';')) return original;
    const body = text.slice(0, -1).trimEnd();
    if (!body.startsWith('(')) return dedent(body);
    const group = scanParens(body, 0).value;
    // Parentheses that do not wrap the WHOLE expression are the user's: `(a) + (b)`.
    if (!group.closed || group.span.end !== body.length) return dedent(body);
    return dedent(body.slice(group.inner.start, group.inner.end));
  }

  const open = text.indexOf('(');
  const group = scanParens(text, open).value;
  return dedent(text.slice(group.inner.start, group.inner.end));
}

/**
 * Format one JS/TS fragment. `ok: false` means it was left as written.
 *
 * An empty fragment never reaches the engine: `@()` is legal to type and is not a program,
 * so wrapping it would manufacture a syntax error out of an empty selection.
 */
export async function formatJsFragment(
  engine: LeafEngine,
  kind: JsFragmentKind,
  source: string,
  indentColumns: number,
  singleQuote: boolean,
  options: ResolvedOptions,
): Promise<{ readonly text: string; readonly ok: boolean }> {
  if (source.trim() === '') return { text: source, ok: true };

  const out = await engine.format(
    { language: 'ts', source: wrapFragment(kind, source), indentColumns, singleQuote },
    options,
  );
  if (!out.ok) return { text: source, ok: false };
  return { text: unwrapFragment(kind, out.code, source), ok: true };
}
