/**
 * `binary`: a positional form travels as bytes (SDD-56 §4.18), written by `fud-bin`.
 */

import type { Schema } from '@fudic/forms';
import { binWire } from '../../wire/bin.js';
import { formTypes } from '../../wire/schema.js';
import type { Stage } from '../pipeline.js';

export const BIN_TYPE = binWire.type;

/** A positional value with its keys back, a group as its own record. */
const keyed = (schema: Schema, value: readonly unknown[]): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(schema).map(([name, node], i) => [
      name,
      '$schema' in node ? keyed(node.$schema, value[i] as readonly unknown[]) : value[i],
    ]),
  );

export const binary: Stage = {
  name: 'binary',
  supported: () => true,
  applies: (p) => p.schema !== undefined,
  apply: (p) => ({
    ...p,
    value: binWire.encodeArgs(formTypes(p.schema!), keyed(p.schema!, p.value as readonly unknown[])),
    headers: { ...p.headers, 'content-type': BIN_TYPE },
  }),
};
