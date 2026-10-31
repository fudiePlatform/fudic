/**
 * The name the compiler replaces in every module of a language's graph (SDD-58 §4.3, decision
 * 161). It exists so a `.fud` and a `.ts` typecheck; at runtime it is never reached, because the
 * compiler rewrote every use. Reaching it means a module escaped the compiler — a `.ts` outside
 * the project — and that is said loudly rather than answered with the wrong language.
 *
 * `locale` and `format` were here too; they speak of the page's language, which every app has
 * now, and moved to `@fudic/core` with the pipes (SDD-71).
 */

import type { MessageArg } from './compiled.js';

/** A translatable message in code or in a prop value. The first argument must be a string literal. */
export function t(message: string, args?: Readonly<Record<string, MessageArg>>): string {
  void message;
  void args;
  throw new Error('compiled away: this module was not compiled for a locale');
}
