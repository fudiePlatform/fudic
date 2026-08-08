/**
 * The two capability profiles every emitted stretch falls into (SDD-23 §3.1, §5).
 *
 * There are exactly two, and that is the point: text is either the user's or the
 * compiler's. A third profile would mean some scaffolding is half-visible, which is how
 * an LSP ends up offering to rename `$tpl`.
 */

import type { MappingCaps } from './types.js';

/**
 * User code, copied verbatim: everything routes. `format` stays `false` — formatting is
 * SDD-26 over the source, never over the projection.
 *
 * Completion is `isAdditional`, and that is not a downgrade — it is what keeps TypeScript
 * from being the ONLY voice at these offsets. Volar claims a position for the first embedded
 * code that answers it and skips the rest, and the root code is visited last; so with a plain
 * `true` here, everything the server itself offers inside `@code` or over a half-written `@`
 * expression is computed and thrown away. TypeScript still answers exactly as before: its
 * items are merged rather than exclusive (SDD-28 §5.5).
 */
export const USER_CAPS: MappingCaps = {
  completion: { isAdditional: true },
  verification: true,
  semantic: true,
  navigation: true,
  structure: true,
  format: false,
};

/**
 * User code that ANOTHER projection already owns for completion.
 *
 * The neutral zone of `@code` is emitted into both virtuals (§4.1), so at those offsets two
 * TypeScript files answer the same question. Volar used to hide that: the first projection to
 * answer claimed the position and the second was skipped. With completion additional
 * (`USER_CAPS`) nothing claims anything any more, and the same identifier list would arrive
 * twice. So the echo says so: the client virtual is canonical for the neutral zone — the same
 * rule the server already applies to its duplicate diagnostics — and the server virtual keeps
 * every other capability while offering no completions of its own.
 */
export const USER_ECHO_CAPS: MappingCaps = {
  completion: false,
  verification: true,
  semantic: true,
  navigation: true,
  structure: true,
  format: false,
};

/**
 * Diagnostics only, for the one stretch that is neither: the synthetic type name a tag is
 * projected as (`$C_app_missing` for `<app-missing>`).
 *
 * That identifier is scaffolding — the user never typed it — but its whole purpose is to
 * be *undeclared*, so that an unregistered custom element fails with `TS2304` on the tag
 * (decision 41). The diagnostic must therefore reach the source, while completion, hover
 * and rename must not: nobody wants TypeScript's type suggestions inside a tag name, and a
 * rename there would rewrite the tag through a name of a different length.
 *
 * It exists because the alternative is worse: marking it as user code makes the projection
 * lie about what the user wrote, and marking it as scaffolding silently drops the very
 * error the projection was built to produce.
 */
export const DIAGNOSTIC_ONLY_CAPS: MappingCaps = {
  completion: false,
  verification: true,
  semantic: false,
  navigation: false,
  structure: false,
  format: false,
};

/**
 * A stretch that exists so the editor can ask «what may go here?», and for nothing else.
 *
 * The gap inside `<app-badge |>` is not text the user wrote and carries no error of its own —
 * but it is where a prop is about to be typed, and the object literal it stands for is what
 * knows the answer. Completion alone routes: a diagnostic there would be about a stretch the
 * user cannot see, and rename or hover would reach into invented braces.
 */
export const COMPLETION_ONLY_CAPS: MappingCaps = {
  completion: true,
  verification: false,
  semantic: false,
  navigation: false,
  structure: false,
  format: false,
};

/**
 * A name the user wrote, projected as a string literal — quotes included.
 *
 * Two capabilities, and each is there for a reason the other cannot cover. `verification`,
 * because TypeScript reports over the literal WITH its quotes and a reported range only maps
 * back when both of its ends land in one stretch that carries it — the `@section` precedent.
 * `completion`, because for an event name the list IS the point: `@cli|` asks
 * `keyof HTMLElementEventMap` and gets `click`, `change`, `input`, with no table kept here.
 *
 * Navigation, rename and hover stay off: the stretch is two characters longer than the name
 * it stands for, so a rename through it would rewrite the source through a range of a
 * different length.
 */
export const LITERAL_NAME_CAPS: MappingCaps = {
  completion: true,
  verification: true,
  semantic: false,
  navigation: false,
  structure: false,
  format: false,
};

/**
 * Scaffolding the emitter invented: nothing routes. No diagnostic lands on it, no rename
 * reaches it, no hover answers for it — the user never sees text they did not write.
 */
export const SCAFFOLD_CAPS: MappingCaps = {
  completion: false,
  verification: false,
  semantic: false,
  navigation: false,
  structure: false,
  format: false,
};
