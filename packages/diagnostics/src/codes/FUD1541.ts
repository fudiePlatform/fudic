import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD1541`. */
export interface FUD1541Params extends FileInput {
  readonly name: string;
  /**
   * - `token`: the name is not an HTTP token.
   * - `repeated`: the header is already written in this file, or in this block.
   * - `ascii`: the name or the value has a character outside printable ASCII.
   */
  readonly problem: 'token' | 'repeated' | 'ascii';
}

/** A header written twice, with a name that is not a token, or with a character outside ASCII (SDD-84). */
export const FUD1541 = (p: FUD1541Params): FileDiagnostic => {
  const message =
    p.problem === 'repeated'
      ? `${p.name} is written twice: only one of them can be sent`
      : p.problem === 'ascii'
        ? `${p.name} has a character outside printable ASCII, which a header cannot carry`
        : `"${p.name}" is not a header name: letters, digits and !#$%&'*+-.^_\`|~ only`;
  return file('FUD1541', 'error', message, p);
};
