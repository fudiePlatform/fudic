// WRITTEN BY THE DEVELOPER. The handlers of fudapi/user-form.fudapi: one export per function, with
// its name (`put save` → `save`). fudic finds this file by name: user-form.fudapi → user-form.ts.
// When `save` runs, `person` already passed every rule: the NIF letter and that nobody has it.

import { inject } from '@fudic/di';
import { SaveFails, type SaveHandler } from '../generated/user-form';
import { Users } from '../services/users';

export const save = ((ctx, person) => {
  // A 409: the form keeps it (its `catches`) and paints it in the summary.
  if (person.name.trim().toLowerCase() === 'admin') throw SaveFails.reserved();
  console.info(`[user-form] ${ctx.user.name} da de alta a ${person.name}`);
  return inject(Users).add(person);
}) satisfies SaveHandler;
