/** What `routes/index.fudapi` declares, implemented. */

import { load, reserve, ReserveFails, subscribe } from 'fudic:routes/index';

load.handle(() => ({ alta: new Date(Date.UTC(2026, 9, 15)) }));

subscribe.handle((ctx) => {
  console.info(`[i18n] ${ctx.form.$value().email} se apunta`);
});

// The code, never the words: the page says `full` in its own language.
reserve.handle(() => {
  throw ReserveFails.full();
});
