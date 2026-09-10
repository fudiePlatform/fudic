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
  a1: control('', [required]),
  a2: control('', [minLength(2)]),
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
