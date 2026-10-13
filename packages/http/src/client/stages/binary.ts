/**
 * `binary`: a positional form whose every control declares its type travels as bytes
 * (SDD-56 §4.18). A value the format cannot hold goes on to `json` untouched.
 */

import { isTyped, representable, writeBinary } from '@fudic/forms/wire';
import type { Stage } from '../pipeline.js';

export const BIN_TYPE = 'application/fud+bin';

export const binary: Stage = {
  name: 'binary',
  supported: () => true,
  applies: (p) =>
    p.schema !== undefined &&
    isTyped(p.schema) &&
    representable(p.schema, p.value as readonly unknown[]),
  apply: (p) => ({
    ...p,
    value: writeBinary(p.schema!, p.value as readonly unknown[]),
    headers: { ...p.headers, 'content-type': BIN_TYPE },
  }),
};
