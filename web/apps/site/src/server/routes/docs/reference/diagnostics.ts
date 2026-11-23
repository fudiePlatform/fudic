/**
 * The diagnostics reference: one code, read from its `FUDnnnn.md` in `@fudic/diagnostics`, the
 * same file the editor's "Explain" action and the MCP read. Nothing is copied into the site.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { explain } from '@fudic/diagnostics/explain';
import { load } from 'fudic:routes/docs/reference/diagnostics';

/** The explanations as the package ships them: `src/codes/*.md` beside its `package.json`. */
const codes = join(dirname(createRequire(import.meta.url).resolve('@fudic/diagnostics/package.json')), 'src', 'codes');

/** `FUD0010`, `fud10` or `10` all name FUD0010. Anything else names no code. */
export function normalize(raw: string): string | undefined {
  const m = /^\s*(?:fud)?\s*(\d{1,4})\s*$/iu.exec(raw);
  return m === null ? undefined : `FUD${m[1]!.padStart(4, '0')}`;
}

/** Splits an explanation on its backticks: odd runs are code. */
export function parts(text: string): { at: number; text: string; code: boolean }[] {
  return text
    .split('`')
    .map((run, i) => ({ at: i, text: run, code: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}

load.handle((ctx) => {
  const query = (ctx.url.searchParams.get('code') ?? '').trim();
  const none = { query, code: '', title: [], severity: '', why: [], fix: [], replaced: [] };
  if (query === '') return { ...none, state: 'empty' };
  const code = normalize(query);
  const found = code === undefined ? undefined : explain(code, codes);
  if (found === undefined) {
    ctx.response.status = 404;
    return { ...none, state: 'missing' };
  }
  return {
    query: found.code,
    state: 'found',
    code: found.code,
    title: parts(found.title),
    severity: found.severity,
    why: parts(found.why),
    fix: parts(found.fix ?? ''),
    replaced: parts(found.replacedBy ?? ''),
  };
});
