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

import { control, form, minLength, required, serverValidator } from '@fudic/forms';

import { aliasTaken } from '../data/aliases.js';

export const userForm = form({
  name: control('', [required]),
  alias: control('', [
    required,
    minLength(3),
    // Solo con `{ server: true }`: consulta la capa de datos, que no debe llegar al navegador.
    serverValidator(async (v) => ((await aliasTaken(String(v))) ? { taken: true } : null)),
  ]),
});
