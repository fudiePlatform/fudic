/**
 * The signature of a function (SDD-67 §3.3, §4.3): FNV-1a of 32 bits over its canonical text,
 * which says every type its call writes and reads in `fud-bin` and nothing else — a rule, a
 * comment or a middleware does not change a byte, so it does not change the signature.
 *
 * `route(<arg>:<type>,…)|query(…)|body(…)|-><type>`: each type as written, a `type` unfolded as
 * `{field:type,…}`, an `enum` as `<a|b|c>`, a form as `form{…}` with each control as the type it
 * travels as, and a type that names itself as `@<name>` inside itself. The same function as
 * `signature` of `@fudic/http/wire`, which a test or another backend computes it again with.
 */

import type { ArgPlace, FnDecl, FormMember, TypeExpr } from '../ast.js';
import type { ApiIndex } from '../index-api.js';
import { FLOATS, INTEGERS } from '../types-check.js';

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

export function fnv1a(text: string): string {
  let hash = OFFSET;
  for (const byte of new TextEncoder().encode(text)) hash = Math.imul(hash ^ byte, PRIME) >>> 0;
  return hash.toString(16).padStart(8, '0');
}

export function canonical(d: FnDecl, index: ApiIndex): string {
  const part = (place: ArgPlace): string =>
    d.args
      .filter((a) => a.place === place)
      .map((a) => `${a.name.text}:${typeText(a.type, index, [])}`)
      .join(',');
  const form = d.form === undefined ? undefined : index.lookup('form', d.form.name.text)?.decl;
  const body = form === undefined ? part('body') : `form${controls(form.fields)}`;
  const returns = d.returns === undefined ? '' : typeText(d.returns.type, index, []);
  return `route(${part('route')})|query(${part('query')})|body(${body})|->${returns}`;
}

/** A type with every project type unfolded; `within` is the types it is already inside of. */
function typeText(t: TypeExpr, index: ApiIndex, within: readonly string[]): string {
  switch (t.kind) {
    case 'list':
      return `${typeText(t.element, index, within)}[]`;
    case 'optional':
      return `${typeText(t.inner, index, within)}?`;
    case 'map':
      return `map ${typeText(t.key, index, within)} ${typeText(t.value, index, within)}`;
    case 'named': {
      const name = t.name.text;
      const decl = index.lookup('type', name)?.decl;
      if (decl === undefined) return name;
      if (decl.kind === 'enum') return `<${decl.members.map((m) => m.text).join('|')}>`;
      if (within.includes(name)) return `@${name}`;
      return `{${decl.fields.map((f) => `${f.name.text}:${typeText(f.type, index, [...within, name])}`).join(',')}}`;
    }
  }
}

/** The controls of a form or a group, each as the type it travels as (SDD-67 §3.1). */
function controls(members: readonly FormMember[]): string {
  return `{${members.map((m) => `${m.name.text}:${m.kind === 'form-group' ? controls(m.fields) : control(m.type)}`).join(',')}}`;
}

/** `u8`…`f64` and `date` may be empty, and so may a list; `bool` is not; anything else is text. */
function control(type: TypeExpr): string {
  const bare = type.kind === 'optional' ? type.inner : type;
  if (bare.kind === 'list') return `${tag(bare.element)}[]?`;
  const name = tag(bare);
  return name === 'bool' || name === 'str' ? name : `${name}?`;
}

/** The tag of a control's factory: a number, `bool`, `date`, or `str` for every text. */
function tag(type: TypeExpr): string {
  const name = type.kind === 'named' ? type.name.text : 'str';
  return name === 'bool' || name === 'date' || name in INTEGERS || FLOATS.has(name) ? name : 'str';
}
