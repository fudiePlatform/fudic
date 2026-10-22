/** What `components/user-form.fudapi` declares, implemented: the sign-up of a person. */

import { inject } from '@fudic/di';
import { save, SaveFails } from 'fudic:components/user-form';
import { Users } from '../services/users';

save.handle((ctx) => {
  const person = ctx.form.$value();
  // A 409: the form keeps it (its `catches`) and paints it in its summary.
  if (person.name.trim().toLowerCase() === 'admin') throw SaveFails.reserved();
  console.info(`[user-form] ${ctx.user.name} da de alta a ${person.name}`);
  return inject(Users).add(person);
});
