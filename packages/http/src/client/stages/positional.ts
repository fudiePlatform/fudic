/** `positional`: a form to a function that declares `.form` loses its keys (SDD-56 §4.17). */

import type { AnyForm } from '@fudic/forms';
import { isForm } from '../form.js';
import type { Stage } from '../pipeline.js';

export const FUD_TYPE = 'application/fud';

export const positional: Stage = {
  name: 'positional',
  supported: () => true,
  applies: (p, call) => call.method !== 'GET' && isForm(p.value),
  apply: (p) => {
    const form = p.value as AnyForm;
    return {
      value: form.$positional(),
      headers: { ...p.headers, 'content-type': FUD_TYPE },
      schema: form.$schema,
    };
  },
};
