// El otro extremo. Importa EL MISMO blog.form.js que el cliente.
// No sabe nada de la codificación: recibe el body y lo asigna a $value.

import { validate } from './forms.js';
import { postForm } from './blog.form.js';

// No imprime nada: devuelve lo que ha destructurado, y quien llama lo muestra.
const handler = async (ctx) => ({
  status: 200,
  body: { ok: true, recibido: ctx.form.$value },
});

const mw = validate(postForm);

export const Put = (ctx) => mw(ctx, handler);
