// The `later` fields of `/espera`, on the criterion's clock: with `clock` in the spec they
// arrive only when `wait` moves it, not in real time.
import type { Fixtures } from 'fudic:routes/espera';
import { later } from '@fudic/spec';

export default {
  data: {
    'a-su-tiempo': {
      title: 'Lo que tarda, llega después',
      inicio: later(2000, 10),
      resumen: later(5000, { personas: 2, activas: 1 }),
      roto: later.fails(3000, 404, 'el servicio de avisos no responde'),
    },
  },
} satisfies Fixtures;
