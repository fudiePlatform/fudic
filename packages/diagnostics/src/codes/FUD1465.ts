import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1465`. */
export interface FUD1465Params extends SourceInput {
  /** The event binding as written, without the `@`: `click.`, `click.a.b`. */
  readonly text: string;
}

/** A handler name that is empty or malformed (SDD-80). */
export const FUD1465 = (p: FUD1465Params): SourceDiagnostic =>
  source(
    'FUD1465',
    'error',
    `\`@${p.text}\`: a handler name goes after the event and one \`.\`, in lowercase letters, digits and \`-\` (\`@click.borrar\`)`,
    p,
  );
