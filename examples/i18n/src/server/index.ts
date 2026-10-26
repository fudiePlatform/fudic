/** What `routes/index.fudapi` declares, implemented. */

import { load } from 'fudic:routes/index';

load.handle(() => ({ alta: new Date(Date.UTC(2026, 9, 15)) }));
