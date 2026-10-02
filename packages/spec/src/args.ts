/**
 * What a token is, as an argument: bare, a string, or a `role:` reference. Never its type —
 * `44` is a bare token here, and only the term's `meta.params` decides it is a number.
 */

import { FUD0935, span, type SourceDiagnostic } from '@fudic/diagnostics';
import type { Arg, Name } from './ast.js';
import type { Token } from './line.js';

const ROLE = 'role:';

/** Classify a token. A malformed one is reported and degrades to a bare argument. */
export function toArg(token: Token, out: SourceDiagnostic[]): Arg {
  const { quoted, raw } = token;
  const bare = { kind: 'bare', text: raw, span: token.span } as const;

  if (quoted.length === 0) {
    if (!raw.startsWith(ROLE)) return bare;
    const role = raw.slice(ROLE.length);
    if (role === '' || role.includes('/')) return malformed(token, bare, out);
    return { kind: 'role', role: roleName(token, role), span: token.span };
  }

  const [only] = quoted;
  if (quoted.length === 1 && only !== undefined && only.span.end === token.span.end) {
    if (only.span.start === token.span.start) {
      const contentEnd = only.closed ? only.span.end - 1 : only.span.end;
      return { kind: 'string', text: only.text, span: token.span, contentSpan: span(only.span.start + 1, contentEnd) };
    }
    const head = raw.slice(0, only.span.start - token.span.start);
    const role = head.slice(ROLE.length, -1);
    if (head.startsWith(ROLE) && head.endsWith('/') && role !== '' && !role.includes('/')) {
      const name: Name = { text: only.text, span: only.span };
      return { kind: 'role', role: roleName(token, role), name, span: token.span };
    }
  }
  return malformed(token, bare, out);
}

/** The role right after `role:`. */
function roleName(token: Token, role: string): Name {
  const start = token.span.start + ROLE.length;
  return { text: role, span: span(start, start + role.length) };
}

/** Report, unless the token is already reported for an unclosed quote. */
function malformed(token: Token, bare: Arg, out: SourceDiagnostic[]): Arg {
  if (token.quoted.every((q) => q.closed)) out.push(FUD0935({ span: token.span }));
  return bare;
}
