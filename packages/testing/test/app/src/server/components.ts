/** The functions of the components of the test app. */

import { inject } from '@fudic/di';
import { setCookie } from '@fudic/http';
import { save as saveAlias } from 'fudic:components/x-alias';
import { whoami } from 'fudic:components/x-guarded';
import { greet } from 'fudic:components/x-hello';
import { save } from 'fudic:components/x-save';
import { stamp } from 'fudic:components/x-stamp';
import { visit } from 'fudic:components/x-visits';
import { greetingFor, handled } from '../data/greetings';
import { NOW } from '../services/now';

saveAlias.handle(() => 'saved');

whoami.handle((ctx) => ctx.user);

greet.handle((ctx) => {
  handled.count += 1;
  return greetingFor(ctx.args.name);
});

save.handle(() => 'saved');

stamp.handle(() => inject(NOW));

visit.handle((ctx) => {
  const visits = Number(ctx.cookies.get('visits') ?? '0') + 1;
  // The defaults: `HttpOnly`, which the jar of the tests has to keep all the same (SDD-69 §4.6).
  setCookie(ctx, 'visits', String(visits));
  return visits;
});
