import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0834`. */
export type FUD0834Params = SourceInput & {
  /** The name both snippets claim. */
  readonly name: string;
} & (
    | {
        /** Both are declared in the file itself. */
        readonly where: 'file';
      }
    | {
        /** They meet in the file's scope, at least one brought in by an import. */
        readonly where: 'scope';
        /** Absolute path of the file that declares the first one. */
        readonly first: string;
        /** Absolute path of the file that declares the second one. */
        readonly second: string;
      }
  );

/** Two snippets under one name in one scope (SDD-29). */
export const FUD0834 = (p: FUD0834Params): SourceDiagnostic =>
  source(
    'FUD0834',
    'error',
    p.where === 'file'
      ? `this file declares two snippets called "${p.name}"`
      : `two snippets are called "${p.name}" in this file's scope: ${p.first} and ${p.second}. Give one of the two imports an "as" to put it under a namespace`,
    p,
  );
