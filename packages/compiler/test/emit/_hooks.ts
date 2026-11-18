/** Shared by the SDD-86 emit tests: a `.fud` with its lifecycle hooks cut out. */
import { extractCode, type CodeDocument } from '../../src/emit/oxc-code.js';
import { parse } from './_support.js';

/** `source` with every top-level hook statement cut out, whole: what the file says without hooks. */
export function withoutHooks(source: string): string {
  const code = extractCode(source, parse(source) as CodeDocument);
  let out = source;
  for (const use of [...code.hooks].filter((h) => h.topLevel).sort((a, b) => b.span.start - a.span.start)) {
    const end = out[use.span.end] === ';' ? use.span.end + 1 : use.span.end;
    out = out.slice(0, use.span.start) + out.slice(end);
  }
  return out;
}
