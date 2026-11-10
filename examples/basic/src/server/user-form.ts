/** What `components/user-form.fudapi` declares, implemented: the sign-up of a person. */

import { inject } from '@fudic/di';
import { save, SaveFails } from 'fudic:components/user-form';
import { Avatars } from '../services/avatars';
import { Users } from '../services/users';

save.handle(async (ctx) => {
  // `avatar` is a `File`, its type and size already checked by the server, or null.
  const { avatar, ...person } = ctx.form.$value();
  // A 409: the form keeps it (its `catches`) and paints it in its summary.
  if (person.name.trim().toLowerCase() === 'admin') throw SaveFails.reserved();
  console.info(`[user-form] ${ctx.user.name} da de alta a ${person.name}`);
  const added = inject(Users).add({ ...person, avatar: avatar !== null });
  if (avatar !== null) await inject(Avatars).put(added.id, avatar);
  return added;
});
