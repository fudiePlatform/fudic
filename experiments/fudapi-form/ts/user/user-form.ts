// WRITTEN BY THE DEVELOPER. The handler of `put save` in fudapi/user-form.fudapi. It lives in the
// server folder (src/server), under any name: fudic loads the folder, it never looks for this file.
// The handler is exported on its own so a unit test can call it without the chain; `save.handle`
// joins it to the generated function. When it runs, the form already passed every rule.

import { inject } from '@fudic/di';
import { save, SaveFails, type SaveHandler } from '../generated/user-form';
import { Users } from '../services/users';

export const altaDeUsuario = ((ctx) => {
  const person = ctx.form.$value();
  // A 409: the form keeps it (its `catches`) and paints it in the summary.
  if (person.name.trim().toLowerCase() === 'admin') throw SaveFails.reserved();
  console.info(`[user-form] ${ctx.user.name} da de alta a ${person.name}`);
  return inject(Users).add({ ...person, age: person.age ?? 0 }); // `required` passed: never 0
}) satisfies SaveHandler;

save.handle(altaDeUsuario);
