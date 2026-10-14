/**
 * `json`: whatever is not bytes yet becomes text. A positional form keeps the type
 * `positional` gave it; anything else is JSON with its keys, a form included, by its value.
 */

import { isForm } from '../form.js';
import { isBytes, type Stage } from '../pipeline.js';

export const JSON_TYPE = 'application/json';

export const json: Stage = {
  name: 'json',
  supported: () => true,
  applies: (p) => !isBytes(p.value),
  apply: (p) => ({
    ...p,
    value: JSON.stringify(isForm(p.value) ? p.value.$value() : p.value),
    headers: { 'content-type': JSON_TYPE, ...p.headers },
  }),
};
