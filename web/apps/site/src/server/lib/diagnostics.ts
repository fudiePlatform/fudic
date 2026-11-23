/**
 * One diagnostic, read from its `FUDnnnn.md` in `@fudic/diagnostics`: the same file the editor's
 * "Explain" action and the MCP read. Nothing is copied into the site.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { explain } from '@fudic/diagnostics/explain';

/** The explanations as the package ships them: `src/codes/*.md` beside its `package.json`. */
const codes = join(dirname(createRequire(import.meta.url).resolve('@fudic/diagnostics/package.json')), 'src', 'codes');

/** Where every code has its page. */
export const BASE = '/docs/reference/diagnostics';

/** `FUD0010`, `fud10` or `10` all name FUD0010. Anything else names no code. */
export function normalize(raw: string): string | undefined {
  const m = /^\s*(?:fud)?\s*(\d{1,4})\s*$/iu.exec(raw);
  return m === null ? undefined : `FUD${m[1]!.padStart(4, '0')}`;
}

/** A run of an explanation: plain text, or text written as code between backticks. */
export interface Part {
  at: number;
  text: string;
  code: boolean;
}

/** Splits an explanation on its backticks: odd runs are code. */
export function parts(text: string): Part[] {
  return text
    .split('`')
    .map((run, i) => ({ at: i, text: run, code: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}

/** A code's explanation, ready for the page; undefined when there is no such code. */
export function lookup(code: string) {
  const found = explain(code, codes);
  if (found === undefined) return undefined;
  return {
    code: found.code,
    title: parts(found.title),
    severity: found.severity,
    why: parts(found.why),
    fix: parts(found.fix ?? ''),
    replaced: parts(found.replacedBy ?? ''),
  };
}
