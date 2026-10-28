/**
 * `encode`: the body in the function's format (SDD-67 §3.6), with its `content-type`. A form
 * travels as its value: in binary as a level of its controls, in JSON with its keys.
 */

import { isForm } from '../form.js';
import { isBytes, type Stage } from '../pipeline.js';

export const encode: Stage = {
  name: 'encode',
  supported: () => true,
  applies: (p) => !isBytes(p.value),
  apply: (p, call) => {
    const args = (isForm(p.value) ? p.value.$value() : p.value) as Readonly<Record<string, unknown>>;
    return {
      value: call.wire.encodeArgs(call.types, args),
      headers: { ...p.headers, 'content-type': call.wire.type },
    };
  },
};
