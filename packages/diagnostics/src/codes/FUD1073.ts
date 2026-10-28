import { source } from '../make.js';
import type { SourceDiagnostic, SourceInput } from '../types.js';

/** The block that cannot be empty. */
export type FUD1073Block = 'type' | 'enum' | 'form' | 'group';

/** Parameters of `FUD1073`. */
export type FUD1073Params = SourceInput & {
  readonly block: FUD1073Block;
};

const NEEDS: Readonly<Record<FUD1073Block, string>> = {
  type: 'a `type` needs at least one field',
  enum: 'an `enum` needs at least one member',
  form: 'a `form` needs at least one field',
  group: 'a `group` needs at least one field',
};

/** A `.fudapi` block with nothing in it where something is required (SDD-60). */
export const FUD1073 = (p: FUD1073Params): SourceDiagnostic =>
  source('FUD1073', 'error', `empty block: ${NEEDS[p.block]}`, p);
