/** Whether an argument is a form: what `$fn` validates first and `positional` unkeys. */

import type { AnyForm } from '@fudic/forms';

export function isForm(value: unknown): value is AnyForm {
  return typeof value === 'object' && value !== null && '$validate' in value && '$schema' in value;
}
