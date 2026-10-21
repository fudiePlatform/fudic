import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** The shape a name of that class has. */
export type FUD1070Shape = 'kebab' | 'identifier' | 'pascal';

/** Parameters of `FUD1070`. */
export type FUD1070Params = SourceInput & {
  readonly name: string;
  /** What is being named: `rule`, `field`, `type`… */
  readonly what: string;
  readonly shape: FUD1070Shape;
};

const SHAPE: Readonly<Record<FUD1070Shape, string>> = {
  kebab: 'kebab-case, like `nif-unique`',
  identifier: 'an identifier, like `userForm`',
  pascal: 'PascalCase, like `Person`',
};

/** A `.fudapi` name without the shape its class asks for (SDD-60). */
export const FUD1070 = (p: FUD1070Params): SourceDiagnostic =>
  source('FUD1070', 'error', `\`${p.name}\` is not a valid ${p.what} name: it is written in ${SHAPE[p.shape]}`, p);
