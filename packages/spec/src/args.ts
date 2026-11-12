/**
 * What a token is, as an argument: bare, a string, or a reference. Never its type — `44` is a
 * bare token here, and only the term's `meta.params` decides it is a number.
 *
 * A reference is steps joined by `>`, each a tag or `role:<role>` with an optional name —
 * `/"…"` exact, `/~"…"` contained. A `>` inside quotes is part of the name. A lone tag stays a
 * bare argument: it is a reference only to the validator, against an `element` parameter.
 */

import { FUD0935, FUD1509, span, type SourceDiagnostic, type Span } from '@fudic/diagnostics';
import type { AccessibleName, Arg, Name, RefStep } from './ast.js';
import type { Quoted, Token } from './line.js';

const ROLE = 'role:';
const STEP = '>';
const CONTAINS = '~';

/** Classify a token. A malformed one is reported and degrades to a bare argument. */
export function toArg(token: Token, out: SourceDiagnostic[]): Arg {
  const { quoted, raw } = token;
  const bare = { kind: 'bare', text: raw, span: token.span } as const;

  const [only] = quoted;
  if (quoted.length === 1 && only !== undefined && only.span.start === token.span.start && only.span.end === token.span.end) {
    const contentEnd = only.closed ? only.span.end - 1 : only.span.end;
    return { kind: 'string', text: only.text, span: token.span, contentSpan: span(only.span.start + 1, contentEnd) };
  }
  // An unclosed quote is already reported, and where its token ends is anyone's guess.
  if (!quoted.every((q) => q.closed)) return bare;

  const ranges = stepRanges(token);
  if (ranges.length === 1 && quoted.length === 0 && !raw.startsWith(ROLE)) return bare;

  const steps: RefStep[] = [];
  for (const [i, [start, end]] of ranges.entries()) {
    if (start === end) {
      // The `>` on the side of the missing step: after it for the first, before it for the rest.
      const at = i === 0 ? start : start - 1;
      out.push(FUD1509({ span: span(at, at + 1), missing: 'a step beside `>`' }));
      return bare;
    }
    const step = stepOf(token, start, end, out);
    if (step === undefined) return bare;
    steps.push(step);
  }
  return { kind: 'role', steps, span: token.span };
}

/** `[start, end)` of each step of a token, split at every `>` outside quotes. */
function stepRanges(token: Token): readonly (readonly [number, number])[] {
  const ranges: [number, number][] = [];
  let start = token.span.start;
  for (let i = token.span.start; i < token.span.end; i++) {
    const inside = token.quoted.find((q) => q.span.start === i);
    if (inside !== undefined) {
      i = inside.span.end - 1;
    } else if (token.raw[i - token.span.start] === STEP) {
      ranges.push([start, i]);
      start = i + 1;
    }
  }
  ranges.push([start, token.span.end]);
  return ranges;
}

/** One step, `[start, end)` of the token. Undefined when it is malformed, and then reported. */
function stepOf(token: Token, start: number, end: number, out: SourceDiagnostic[]): RefStep | undefined {
  const text = token.raw.slice(start - token.span.start, end - token.span.start);
  const quoted = token.quoted.filter((q) => q.span.start >= start && q.span.end <= end);
  const whole = span(start, end);

  if (!text.startsWith(ROLE)) {
    if (quoted.length > 0) return malformed(whole, out);
    return { kind: 'tag', tag: { text, span: whole }, span: whole };
  }

  const slash = text.indexOf('/');
  const role = slash === -1 ? text.slice(ROLE.length) : text.slice(ROLE.length, slash);
  if (role === '' || quoted.some((q) => slash === -1 || q.span.start < start + slash)) return malformed(whole, out);
  const roleStart = start + ROLE.length;
  const roleName: Name = { text: role, span: span(roleStart, roleStart + role.length) };
  if (slash === -1) return { kind: 'role', role: roleName, span: whole };

  const name = nameOf(start + slash + 1, end, text[slash + 1] === CONTAINS, quoted, out);
  if (name === 'malformed') return malformed(whole, out);
  if (name === undefined) return undefined;
  return { kind: 'role', role: roleName, name, span: whole };
}

/**
 * The name after the `/` at `from`: one quoted section to the end of the step, after a `~` or
 * not. Undefined when a `~` has no text, and then reported.
 */
function nameOf(
  from: number,
  end: number,
  contains: boolean,
  quoted: readonly Quoted[],
  out: SourceDiagnostic[],
): AccessibleName | undefined | 'malformed' {
  const [q, ...more] = quoted;
  if (contains && (q === undefined ? end === from + 1 : q.text === '' && q.span.start === from + 1)) {
    out.push(FUD1509({ span: span(from, end), missing: 'the text after `~`' }));
    return undefined;
  }
  const open = contains ? from + 1 : from;
  if (q === undefined || more.length > 0 || q.span.start !== open || q.span.end !== end) return 'malformed';
  return { text: q.text, span: span(from, end), match: contains ? 'contains' : 'exact' };
}

/**
 * An argument as the term receives it: the text of a bare or a string one, and a reference
 * written back in its one canonical form, its names quoted with `\"` and `\\` escaped.
 */
export function argText(arg: Arg): string {
  if (arg.kind !== 'role') return arg.text;
  return arg.steps.map(stepText).join(STEP);
}

function stepText(step: RefStep): string {
  if (step.kind === 'tag') return step.tag.text;
  const role = `${ROLE}${step.role.text}`;
  if (step.name === undefined) return role;
  const quoted = `"${step.name.text.replace(/[\\"]/gu, (c) => `\\${c}`)}"`;
  return `${role}/${step.name.match === 'contains' ? CONTAINS : ''}${quoted}`;
}

function malformed(at: Span, out: SourceDiagnostic[]): undefined {
  out.push(FUD0935({ span: at }));
  return undefined;
}
