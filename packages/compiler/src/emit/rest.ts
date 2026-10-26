/**
 * The rest of `props<T>()`: `const { label, ...resto } = props<T>()`.
 *
 * The keys a rest gathers are props like any other for whoever hands them over — each has its
 * slot in the payload — but the component reads them as ONE object. These are the few rules
 * every writer of the props needs to agree on, in one place, so the server's slice, the client's
 * intake and its update cannot lay the same keys out differently.
 */

import type { Prop } from './oxc-code.js';

/**
 * The local a prop arrives in on the client. A gathered key has no local of its own in the
 * author's code, so it gets one in the `$` reserve, where it cannot collide with anything the
 * author wrote; the rest object is assembled from those.
 */
export function localOf(prop: Prop): string {
  return prop.rest === undefined ? prop.name : `$o_${prop.name}`;
}

/** Each rest binding of the list, with the keys it gathers in payload order. */
export function restGroups(props: readonly Prop[]): ReadonlyMap<string, readonly Prop[]> {
  const out = new Map<string, Prop[]>();
  for (const prop of props) {
    if (prop.rest === undefined) continue;
    const group = out.get(prop.rest) ?? [];
    group.push(prop);
    out.set(prop.rest, group);
  }
  return out;
}

/**
 * `resto = { placeholder: $o_placeholder, required: $o_required }` — one statement per rest
 * binding, with `let ` in front for the declaration and without it for the update, which runs
 * after the guards have reassigned the locals.
 */
export function restAssignments(props: readonly Prop[], declare: boolean): string {
  return [...restGroups(props)]
    .map(([rest, keys]) => {
      const entries = keys.map((p) => `${JSON.stringify(p.name)}: ${localOf(p)}`).join(', ');
      return `${declare ? 'let ' : ''}${rest} = { ${entries} };`;
    })
    .join(' ');
}

/**
 * The defaults of the named props, applied as the portable view applies a default (SDD-61 §3.6,
 * §4.4): when the prop is absent, `null` included, as in the other five languages. A default of
 * JS fires on `undefined` only, so every writer binds the prop bare and assigns its default right
 * after, in the order the author wrote them.
 */
export function propDefaults(props: readonly Prop[]): string {
  return props.flatMap((p) => (p.def === undefined ? [] : [`${p.name} ??= (${p.def});`])).join(' ');
}
