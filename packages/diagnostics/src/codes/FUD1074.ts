import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Parameters of `FUD1074`. */
export type FUD1074Params = SourceInput & {
  /** The option as written. */
  readonly text: string;
  /** What fits in its place: modes, policies, a duration… */
  readonly expected: readonly string[];
};

/** A `load` option that is no mode, duration, policy or `page` (SDD-60). */
export const FUD1074 = (p: FUD1074Params): SourceDiagnostic =>
  source(
    'FUD1074',
    'error',
    `\`${p.text}\` is not a \`load\` option here: expected ${p.expected.map((w) => `\`${w}\``).join(', ')}`,
    p,
  );
