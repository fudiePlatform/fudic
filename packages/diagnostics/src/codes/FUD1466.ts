import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1466`. */
export interface FUD1466Params extends SourceInput {
  /** The event binding as written, without the `@`: `click.borrar`. */
  readonly text: string;
}

/** A named handler that reads no delegated row (SDD-80). */
export const FUD1466 = (p: FUD1466Params): SourceDiagnostic =>
  source(
    'FUD1466',
    'error',
    `\`@${p.text}\` reads no delegated row: a named handler only exists to serve the marks \`delegate:<row>="${p.text}"\` below it`,
    p,
  );
