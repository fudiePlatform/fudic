import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0360`; `file` is the page, relative to `routesDir`. */
export interface FUD0360Params extends FileInput {
  /** `malformed`: `[name]` is not an identifier; `duplicate`: the path names it twice. */
  readonly problem: 'malformed' | 'duplicate';
  /** The param name as written between the brackets. */
  readonly name: string;
}

/** A malformed or duplicated route param segment (SDD-19). */
export const FUD0360 = (p: FUD0360Params): FileDiagnostic =>
  file(
    'FUD0360',
    'warning',
    p.problem === 'malformed'
      ? `Malformed route param segment "[${p.name}]" in ${p.file}`
      : `Duplicate route param ":${p.name}" in ${p.file}`,
    p,
  );
