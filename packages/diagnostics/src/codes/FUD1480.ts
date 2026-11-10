import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1480`. */
export type FUD1480Params = SourceInput & {
  /** Where the file is: `an argument of a get`, `a route parameter`, `a query parameter`. */
  readonly where: string;
};

/** A `file` where the value travels in the URL (SDD-81). */
export const FUD1480 = (p: FUD1480Params): SourceDiagnostic =>
  source(
    'FUD1480',
    'error',
    `a file cannot travel in a URL: \`file\` is not allowed as ${p.where}; use \`post\`, \`put\`, \`patch\` or \`delete\``,
    p,
  );
