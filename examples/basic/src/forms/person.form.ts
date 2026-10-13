/**
 * The form of `/usuarios`, and every control declares its type.
 *
 * Both ends import this file, so the field names add nothing on the wire: the upload is
 * positional. And because every control is typed (`str`, `u8`, `bool`), it travels in binary.
 * With a long enough note it passes the threshold of `src/http.ts` and goes gzipped as well.
 */

import { bool, form, max, min, pattern, required, serverValidator, str, u8 } from '@fudic/forms';
import { emailTaken } from '../data/people';

export const personForm = form({
  name: str('', [required], { messages: { required: () => 'Escribe el nombre.' } }),
  email: str(
    '',
    [
      required,
      pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
      // Only on the server: it reads the people table, which never reaches the browser.
      serverValidator(async (v) => ((await emailTaken(String(v))) ? { taken: true } : null)),
    ],
    {
      messages: {
        required: () => 'Escribe el email.',
        pattern: () => 'Ese email no parece válido.',
        taken: () => 'Ese email ya lo usa otra persona.',
      },
    },
  ),
  age: u8(null, [required, min(18), max(120)], {
    messages: {
      required: () => 'Escribe la edad.',
      min: (n) => `Tiene que tener al menos ${String(n)} años.`,
      max: (n) => `Como mucho ${String(n)} años.`,
    },
  }),
  active: bool(true),
  notes: str(''),
});
