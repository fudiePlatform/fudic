/**
 * The texts of a `.fudapi` (SDD-60 §3.6, §3.9): templates whose `{x}` takes what the error
 * carries — the one argument of a rule (`{n}`), one of several, or a field of the server's
 * problem (`{detail}`). And `messages`, the project's texts by code, which replaces
 * `setMessages`.
 */

import { setMessages } from '../messages.js';
import type { Messages } from '../types.js';

/** A message function from a template: `Mínimo {n} caracteres.` */
export function text(template: string): (v: unknown) => string {
  return (v) =>
    template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/gu, (_, key: string) => {
      const value = typeof v === 'object' && v !== null ? (v as Readonly<Record<string, unknown>>)[key] : v;
      return String(value);
    });
}

/** The `messages` of the project: installed once, when its module is evaluated. */
export function messages(texts: Readonly<Record<string, string>>): void {
  const out: Record<string, (v: unknown) => string> = {};
  for (const [code, template] of Object.entries(texts)) out[code] = text(template);
  setMessages(out as Messages);
}
