/** What `routes/cuenta.fudapi` declares: who the session cookie names, if anyone. */

import { inject } from '@fudic/di';
import { load } from 'fudic:routes/cuenta';
import { SESSION_COOKIE, Sessions } from '../services/sessions';

load.handle((ctx) => {
  const user = inject(Sessions).find(ctx.cookies.get(SESSION_COOKIE));
  return user === undefined ? {} : { name: user.name };
});
