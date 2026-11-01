/**
 * The two names of a pipe the compiler replaces in every module of a language's graph (SDD-71
 * §3.4, SDD-58 §4.4). They exist so a `.fud` and a `.ts` typecheck; at runtime they are never
 * reached, because the compiler rewrote every use. Reaching one means a module escaped the
 * compiler — a `.ts` outside the project — and that is said loudly rather than answered with the
 * wrong language.
 */

import type { Pipe } from './pipe.js';

/**
 * The page's locale. Compiled to a string literal: `"en"`.
 *
 * Unlike `format` it cannot throw — reading a binding runs no code — so its value is `und`, the
 * BCP 47 tag for «undetermined», which `Intl` accepts and nobody would write.
 */
export const locale: string = 'und';

/** A pipe applied in code: the `@(x | p)` of the view, for TS. */
export function format<T>(value: T, pipe: Pipe<T>): string {
  void value;
  void pipe;
  throw new Error('compiled away: this module was not compiled for a locale');
}
