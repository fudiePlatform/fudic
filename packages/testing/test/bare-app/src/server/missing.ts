import { notFound } from '@fudic/http';
import { load } from 'fudic:routes/missing';

load.handle(() => {
  throw notFound();
});
