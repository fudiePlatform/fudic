/**
 * The three forms of `examples/basic` as they are written by hand today (`person.form.ts`,
 * `user.form.ts`, `wide.form.ts`), copied verbatim but for the data layer: the server-only rules
 * ask `taken`, a set the test fills. Criterion 12 compares the generated forms against these.
 */

import {
  bool,
  control,
  form,
  group,
  max,
  min,
  minLength,
  pattern,
  required,
  serverValidator,
  str,
  u8,
  ValidateOn,
  Validity,
} from '@fudic/forms';

/** What the data layer says is taken: emails and aliases. */
export const taken = new Set<string>();

export const personForm = () =>
  form(
    {
      name: str('', [required], { messages: { required: () => 'Escribe el nombre.' } }),
      email: str(
        '',
        [required, pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/), serverValidator(async (v) => (taken.has(String(v)) ? { taken: true } : null))],
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
    },
    { catches: [400, 409, 422] },
  );

export const userForm = () =>
  form(
    {
      name: control('', [required], { messages: { required: () => 'Escribe tu nombre.' } }),
      alias: control('', [required, minLength(3), serverValidator(async (v) => (taken.has(String(v)) ? { taken: true } : null))], {
        messages: {
          required: () => 'Elige un alias.',
          minLength: (n) => `El alias necesita al menos ${String(n)} caracteres.`,
          taken: () => 'Ese alias ya está cogido.',
        },
      }),
      email: control('', [required, pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)], {
        messages: { required: () => 'Escribe tu email.', pattern: () => 'Ese email no parece válido.' },
      }),
      web: control('', [pattern(/^https?:\/\/.+/)], {
        messages: { pattern: () => 'La web empieza por http:// o https://.' },
      }),
      acceso: group(
        {
          clave: control('', [required, minLength(8)], {
            messages: { required: () => 'Elige una contraseña.', minLength: (n) => `Mínimo ${String(n)} caracteres.` },
          }),
          repetir: control('', [required], { messages: { required: () => 'Repite la contraseña.' } }),
        },
        [(v) => (v.clave === v.repetir ? null : { mismatch: true })],
        { messages: { mismatch: () => 'Las contraseñas no coinciden.' } },
      ),
    },
    {
      summary: (f) => {
        const found: Record<string, true> = {};
        if (f.alias() !== '' && f.alias() === f.name()) found.sameAsName = true;
        if (f.name() !== '' && f.acceso.clave().includes(f.name())) found.keyHasName = true;
        return Object.keys(found).length > 0 ? found : null;
      },
      messages: {
        sameAsName: () => 'El alias no puede ser tu nombre.',
        keyHasName: () => 'La contraseña no puede contener tu nombre.',
      },
      validateOn: ValidateOn.Blur | ValidateOn.Input,
      validity: Validity.Interacted,
    },
  );

export const wideForm = () =>
  form({
    a1: control('', [required], { messages: { required: () => 'El campo 1 es obligatorio.' } }),
    a2: control('', [minLength(2)], {
      messages: { minLength: (n) => `El campo 2 necesita al menos ${String(n)} caracteres.` },
    }),
    a3: control(''),
    a4: control(''),
    a5: control(''),
    a6: control(''),
    a7: control(''),
    a8: control(''),
    a9: control(''),
    a10: control(''),
    a11: control(''),
    a12: control(''),
  });
