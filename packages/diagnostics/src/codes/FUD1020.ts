import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** What is wrong with a `t()` call. */
export type FUD1020Problem =
  /** The first argument is not a string literal: there is no message to extract. */
  | { readonly problem: 'not-literal' }
  /** The message has holes and the second argument is not an object literal naming them all. */
  | {
      readonly problem: 'holes';
      /** The holes of the message the object does not name, in message order. */
      readonly missing: readonly string[];
    };

/** Parameters of `FUD1020`. */
export type FUD1020Params = SourceInput & FUD1020Problem;

function describe(p: FUD1020Problem): string {
  switch (p.problem) {
    case 'not-literal':
      return '`t()` takes a string literal as its first argument: a computed message cannot be extracted or translated';
    case 'holes':
      return `\`t()\` needs an object literal with a key for every hole of its message: missing ${p.missing.map((h) => `\`${h}\``).join(', ')}`;
  }
}

/** `t()` without a literal message, or without the object of its holes (SDD-58). */
export const FUD1020 = (p: FUD1020Params): SourceDiagnostic => source('FUD1020', 'error', describe(p), p);
