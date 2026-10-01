import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD0592`. */
export interface FUD0592Params extends SourceInput {
  /**
   * Why the element cannot carry a control: an input with no user value
   * (`submit`/`reset`/`button`/`image`), or a file input.
   */
  readonly reason: 'no-value' | 'file';
}

/** A `control` on an element that cannot carry a user value (SDD-34). */
export const FUD0592 = (p: FUD0592Params): SourceDiagnostic =>
  source(
    'FUD0592',
    'error',
    p.reason === 'file'
      ? '`control` on `<input type="file">` is not supported: file upload needs multipart and a value that is not JSON'
      : '`control` needs an element that carries a user value: `submit`, `reset`, `button` and `image` inputs have none',
    p,
  );
