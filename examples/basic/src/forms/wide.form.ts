/**
 * Un formulario ANCHO, y solo por eso: doce campos.
 *
 * Sirve para medir. Antes de SDD-37 cada control pedía `input`, `change` y `blur` a SU
 * elemento, así que este formulario costaba treinta y seis listeners y el número crecía con
 * el marcado. Ahora la raíz tiene uno por tipo de evento y el elemento tiene una fila en una
 * tabla: tres, los mismos que costaría con dos campos.
 */

import { control, form, minLength, required } from '@fudic/forms';

export const wideForm = form({
  // Sus propios textos: el mensaje es la descripción accesible del campo, y el código de la
  // regla (`required`) no le dice nada a quien lo oye.
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
