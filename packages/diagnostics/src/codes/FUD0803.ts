import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0803`; `file` is the layout that asks for the inline runtime. */
export interface FUD0803Params extends FileInput {
  /** The inline runtime specifier as the author writes it. */
  readonly specifier: string;
  /** Where in `file` it is written. */
  readonly offset: number;
}

/** A layout inlines the runtime and the document policy declares no nonce (SDD-45). */
export const FUD0803 = (p: FUD0803Params): FileDiagnostic =>
  file(
    'FUD0803',
    'error',
    `"${p.specifier}" needs the document ` +
      `policy to declare 'nonce-{nonce}', and this one does not ` +
      `(${p.file} at ${p.offset})`,
    p,
  );
