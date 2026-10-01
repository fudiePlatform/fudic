import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0363`; `file` is the `.fud` that references the asset. */
export interface FUD0363Params extends FileInput {
  /** The asset specifier as written. */
  readonly spec: string;
}

/** A literal asset reference that resolves to no file (SDD-19). */
export const FUD0363 = (p: FUD0363Params): FileDiagnostic =>
  file('FUD0363', 'warning', `asset "${p.spec}" not found (referenced by ${p.file})`, p);
