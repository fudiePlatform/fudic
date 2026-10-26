/** What `routes/di.fudapi` declares, implemented. */

import { publish } from '@fudic/di';
import { load } from 'fudic:routes/di';
import { LINES } from '../services/cart';

load.handle(() => {
  const lines = ['manzanas', 'peras'];
  // The ONLY thing that crosses: a value, under a token. The `Cart` the server builds and the
  // one the browser builds start from this same array, and neither of them travels — `fud-di`
  // carries the lines, not the service. Into the container of the request being served, so the
  // value belongs to this response and to no other.
  publish(LINES, lines);
  return { lines };
});
