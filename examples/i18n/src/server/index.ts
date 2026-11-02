/** What `routes/index.fudapi` declares, implemented. */

import { conflict } from '@fudic/http';
import { t } from '@fudic/i18n';
import { load, reserve, subscribe } from 'fudic:routes/index';

load.handle(() => ({ alta: new Date(Date.UTC(2026, 9, 15)) }));

subscribe.handle((ctx) => {
  console.info(`[i18n] ${ctx.form.$value().email} se apunta`);
});

// The handler is compiled once per locale, so `t()` throws in the language of the page.
reserve.handle(() => {
  throw conflict(t('Ya no quedan plazas.'));
});
