/**
 * `json`: whatever is not bytes yet becomes text. A positional form keeps the type
 * `positional` gave it; anything else is JSON with its keys. A form never gets here as itself:
 * a function with a form sends it positional, and one without has plain arguments.
 */

import { isBytes, type Stage } from '../pipeline.js';

export const JSON_TYPE = 'application/json';

export const json: Stage = {
  name: 'json',
  supported: () => true,
  applies: (p) => !isBytes(p.value),
  apply: (p) => ({
    ...p,
    value: JSON.stringify(p.value),
    headers: { 'content-type': JSON_TYPE, ...p.headers },
  }),
};
