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
 */
export const USER_CAPS: MappingCaps = {
  completion: true,
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
