/**
 * The server's own diagnostic catalogue (SDD-24 §4.4): `FUD0460`–`FUD0479`.
 *
 * SDD-21 reaches `FUD0436` and the CLI owns `FUD0440`–`FUD0459`, so `FUD0460` is the next
 * free code. These are the rules that types cannot express: everything else the server
 * reports comes either from the parser and the semantic pass — forwarded verbatim with
 * their span — or from the TypeScript checker over the projection of SDD-23.
 */

import { errorDiag, type Diagnostic, type Span } from '@fudic/compiler';

/** `href` of a `<link rel="component"|"layout">` that resolves to no file (§4.2). */
export const FUD_HREF_UNRESOLVED = 'FUD0460';

/** A user identifier prefixed with `$`: the namespace reserved to the compiler (§4.4). */
export const FUD_RESERVED_DOLLAR = 'FUD0461';

// `FUD0462`–`FUD0479` are reserved. The "required section not filled" rule of §4.4 is NOT
// among them: SDD-21 §4.2 states that a section the page does not fill is silence — «it is
// Razor's `required: false` by default» — and there is no `SectionDecl.required` to read.

/**
 * The `href` points nowhere.
 *
 * The span is the attribute VALUE, not the whole `<link>`: the code action that offers to
 * create the file replaces exactly what the user typed.
 */
export function hrefUnresolved(href: string, span: Span): Diagnostic {
  return errorDiag(FUD_HREF_UNRESOLVED, `Cannot resolve "${href}" to a .fud file`, span);
}

/**
 * A `$`-prefixed identifier in user code.
 *
 * Only the PREFIX is reserved: `foo$` and `obj.$bar` are fine, and the rule is checked over
 * Oxc `Identifier` nodes, never over text — the whole projection of SDD-23 is written in
 * this namespace, and a collision would make scaffolding and user code indistinguishable.
 */
export function reservedDollar(name: string, span: Span): Diagnostic {
  return errorDiag(
    FUD_RESERVED_DOLLAR,
    `"${name}" is reserved: identifiers starting with $ belong to the compiler`,
    span,
  );
}
