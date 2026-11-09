/**
 * What the compiler is told about the fields of a `form` (SDD-81 §3.7): each one by its path,
 * with its type as written — `str`, `file`, `file[]`… — and the types its `accept` rule lists.
 *
 * It is how a `.fud` knows, without reading the contract, that `<input type="file">` is bound to
 * a `file` (`FUD1484`–`FUD1486`), and which `accept` to write on it. A group is not a field: its
 * fields are, under `group.field`.
 */

import type { FormDecl, FormMember, TypeExpr } from './ast.js';

export interface FormFieldFact {
  /** As written, without `?`: `str`, `u8`, `file`, `file[]`, `str[]`. */
  readonly type: string;
  /** The types of its `accept` rule, as written: `image/png, image/jpeg`. */
  readonly accept?: string;
}

const typeText = (t: TypeExpr): string => {
  const bare = t.kind === 'optional' ? t.inner : t;
  if (bare.kind === 'list') return `${typeText(bare.element)}[]`;
  return bare.kind === 'named' ? bare.name.text : 'map';
};

/** The fields of a form by path, its groups walked through. */
export function formFields(decl: Pick<FormDecl, 'fields'>): Readonly<Record<string, FormFieldFact>> {
  const out: Record<string, FormFieldFact> = {};
  const walk = (members: readonly FormMember[], prefix: string): void => {
    for (const m of members) {
      const path = `${prefix}${m.name.text}`;
      if (m.kind === 'form-group') {
        walk(m.fields, `${path}.`);
        continue;
      }
      // `accept "…"` and `accept "…" "text"`: the types are the first string either way.
      const use = m.rules.find((r) => r.name.text === 'accept');
      const first = use?.args[0] ?? use?.text;
      out[path] = { type: typeText(m.type), ...(first?.kind === 'string' ? { accept: first.text } : {}) };
    }
  };
  walk(decl.fields, '');
  return out;
}
