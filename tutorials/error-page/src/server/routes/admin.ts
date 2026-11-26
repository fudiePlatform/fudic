import { forbidden } from '@fudic/http';
import { load } from 'fudic:routes/admin';

load.handle(() => {
  throw forbidden('Only editors can open this page.');
});
