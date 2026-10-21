import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** Where the literal was written. */
export type FUD1068Kind = 'value' | 'argument' | 'status' | 'route';

/** Parameters of `FUD1068`. */
export type FUD1068Params = SourceInput & {
  /** The literal as written. */
  readonly text: string;
  readonly kind: FUD1068Kind;
};

const EXPECTED: Readonly<Record<FUD1068Kind, string>> = {
  value: 'an initial value is a string, a number, `true`, `false` or `[]`',
  argument: 'an argument is a string, a number, `true`, `false` or a name',
  status: 'a status is a three-digit number',
  route: 'a route starts with `/` and each segment is lowercase text or `:arg`',
};

/** A `.fudapi` literal that does not read as what its place expects (SDD-60). */
export const FUD1068 = (p: FUD1068Params): SourceDiagnostic =>
  source('FUD1068', 'error', `malformed literal \`${p.text}\`: ${EXPECTED[p.kind]}`, p);
