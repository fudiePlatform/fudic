import { load } from 'fudic:routes/index';

load.handle(() => ({ time: new Date().toISOString() }));
