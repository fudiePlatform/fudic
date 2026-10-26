/** What `routes/mapas.fudapi` declares, implemented. */

import { load } from 'fudic:routes/mapas';

load.handle(() => ({
  options: [
    { label: 'Declarative Shadow DOM', picked: true },
    { label: 'Routing por fichero', picked: false },
    { label: 'SSG estático e incremental', picked: false },
  ],
}));
