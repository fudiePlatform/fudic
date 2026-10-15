/**
 * The three names the compiler replaces in every module of a language's graph (SDD-58 §4.3,
 * §4.4, decision 161). They exist so a `.fud` and a `.ts` typecheck; at runtime they are never
 * reached, because the compiler rewrote every use. Reaching one means a module escaped the
 * compiler — a `.ts` outside the project, or an app without `locales` — and that is said
 * loudly rather than answered with the wrong language.
 */

import type { MessageArg } from './compiled.js';
import type { Pipe } from './pipe.js';

const COMPILED_AWAY = 'compiled away: this module was not compiled for a locale';

/**
 * The page's locale. Compiled to a string literal: `"en"`.
 *
 * Unlike `t` and `format` it cannot throw — reading a binding runs no code — so its value is
 * `und`, the BCP 47 tag for «undetermined», which `Intl` accepts and nobody would write.
 */
export const locale: string = 'und';

/** A translatable message in code or in a prop value. The first argument must be a string literal. */
export function t(message: string, args?: Readonly<Record<string, MessageArg>>): string {
  void message;
  void args;
  throw new Error(COMPILED_AWAY);
}

/** A pipe applied in code: the `@(x | p)` of the view, for TS. */
export function format<T>(value: T, pipe: Pipe<T>): string {
  void value;
  void pipe;
  throw new Error(COMPILED_AWAY);
}
