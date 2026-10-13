import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1007`. */
export type FUD1007Params = SourceInput & {
  /** The middleware's name. */
  readonly name: string;
};

/** A middleware declared in the `@server` with a `.client` half (SDD-56). */
export const FUD1007 = (p: FUD1007Params): SourceDiagnostic =>
  source(
    'FUD1007',
    'error',
    `\`${p.name}\` is declared in the \`@server\`, so its \`.client\` half never reaches the browser: move it to its own module and import it`,
    p,
  );
