/**
 * El formulario, en su propio fichero.
 *
 * No se define en la vista y eso es lo importante: es un `.ts` que importan **los dos
 * extremos**. El servidor pinta sus valores en el HTML, el cliente hidrata sobre ese mismo
 * HTML enlazando el **mismo objeto**, y cuando el formulario se envíe el servidor podrá
 * enlazar el HTTP contra este mismo schema. La vista solo lo enlaza.
 *
 * `serverValidator` marca la regla que solo corre en el servidor. Que no **corra** en el
 * cliente no basta —su cuerpo viajaría en el bundle, y con él lo que importa—, así que el
 * plugin le sustituye el argumento en el build de cliente y Rollup se lleva lo que colgaba.
 */

import {
  control,
  form,
  group,
  minLength,
  pattern,
  required,
  serverValidator,
  ValidateOn,
  Validity,
} from '@fudic/forms';

import { aliasTaken } from '../data/aliases.js';

export const userForm = form(
  {
    // Cada control dice sus propios textos: `required` no significa lo mismo en el nombre que
    // en el alias. Lo que un control no dice lo dice `setMessages`, y si tampoco, el código.
    name: control('', [required], {
      messages: { required: () => 'Escribe tu nombre.' },
    }),
    alias: control(
      '',
      [
        required,
        minLength(3),
        // Solo con `{ server: true }`: consulta la capa de datos, que no debe llegar al navegador.
        serverValidator(async (v) => ((await aliasTaken(String(v))) ? { taken: true } : null)),
      ],
      {
        messages: {
          required: () => 'Elige un alias.',
          minLength: (n) => `El alias necesita al menos ${String(n)} caracteres.`,
          taken: () => 'Ese alias ya está cogido.',
        },
      },
    ),
    email: control('', [required, pattern(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)], {
      messages: {
        required: () => 'Escribe tu email.',
        pattern: () => 'Ese email no parece válido.',
      },
    }),
    // Opcional: vacío es válido, y si se escribe tiene que ser una URL.
    web: control('', [pattern(/^https?:\/\/.+/)], {
      messages: { pattern: () => 'La web empieza por http:// o https://.' },
    }),

    // Un grupo: dos controles y una regla que mira a los dos. Su error es SU resumen.
    acceso: group(
      {
        clave: control('', [required, minLength(8)], {
          messages: {
            required: () => 'Elige una contraseña.',
            minLength: (n) => `Mínimo ${String(n)} caracteres.`,
          },
        }),
        repetir: control('', [required], {
          messages: { required: () => 'Repite la contraseña.' },
        }),
      },
      [(v) => (v.clave === v.repetir ? null : { mismatch: true })],
      { messages: { mismatch: () => 'Las contraseñas no coinciden.' } },
    ),
  },
  {
    // El resumen del formulario entero: los errores que no son de ningún campo. Puede haber
    // VARIOS a la vez, y se muestran todos.
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

    validateOn: ValidateOn.Blur | ValidateOn.Input, // el valor por defecto, escrito para verlo
    validity: Validity.Interacted, // también el valor por defecto
  },
);
