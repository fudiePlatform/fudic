import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1486`. */
export type FUD1486Params = SourceInput & {
  /** The field's type tag as the form declares it: `str`, `file`. */
  readonly field: string;
  /** Whether the control is an `<input type="file">`. */
  readonly fileInput: boolean;
};

/** A file input and a field that are not both about files (SDD-81). */
export const FUD1486 = (p: FUD1486Params): SourceDiagnostic =>
  source(
    'FUD1486',
    'error',
    p.fileInput
      ? `a file input bound to something that is not a file: the field is \`${p.field}\``
      : `a \`${p.field}\` field needs \`<input type="file">\`: this control cannot choose a file`,
    p,
  );
