/** The functions of `routes/fallos.fudapi` and the remote rule of `rules/nombres.fudapi`. */

import { forbidden } from '@fudic/http';
import { alta, prohibido, rompe, saludo } from 'fudic:routes/fallos';
import { nombreOcupado } from 'fudic:rules/nombres';

saludo.handle(() => 'Hola desde /admin/');

rompe.handle(() => {
  throw new Error('rompe a propósito');
});

prohibido.handle(() => {
  throw forbidden();
});

alta.handle(() => undefined);

// `admin` is taken: anything else is free.
nombreOcupado.check((value) => value !== 'admin');
