/**
 * Entry point of `@fudic/formatter` (SDD-26).
 *
 * The formatter for `.fud` files: one printer over a document IR for the tree, and
 * delegation to `oxfmt` for the leaves that are real JS/TS or real CSS. The same binary
 * answers the editor (SDD-24) and the CLI (`fudic fmt`), because two code paths would
 * eventually disagree.
 */

export const VERSION = '0.0.1';
