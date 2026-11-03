import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0907`. */
export interface FUD0907Params extends SourceInput {
  /** The name the view reads; `props` and `children`, which React gives, get their own reason. */
  readonly name?: string;
}

/** Why a name React provides is not one in fudic (SDD-62). */
const REACT_REASONS: ReadonlyMap<string, string> = new Map([
  ['props', '`props` is a function in `@code`: read the destructured name'],
  ['children', 'use a `<slot>` for the content between the tags'],
]);

/** A name the view reads that the file and the template do not provide; the only global is `undefined` (SDD-51, SDD-61). */
export const FUD0907 = (p: FUD0907Params): SourceDiagnostic => {
  const reason = REACT_REASONS.get(p.name ?? '') ?? 'the only global is `undefined`; declare or import the rest in `@code`';
  return source('FUD0907', 'error', `this name is not available to the view: ${reason}`, p);
};
