import { file } from '../make.js';
import type { FileDiagnostic, FileInput } from '../types.js';

/** Parameters of `FUD0974`; `file` is the fixture. */
export interface FUD0974Params extends FileInput {
  /** The fixture entry, as `props <name>` names it. */
  readonly fixture: string;
  /** The prop whose signal holds the value. */
  readonly prop: string;
}

/** The initial value of a `Signal` prop does not survive `JSON.stringify` (SDD-32). */
export const FUD0974 = (p: FUD0974Params): FileDiagnostic =>
  file(
    'FUD0974',
    'error',
    `the initial value of signal prop "${p.prop}" in fixture "${p.fixture}" cannot be written as a JSON literal`,
    p,
  );
