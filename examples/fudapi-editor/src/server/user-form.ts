// The handler of components/user-form.fudapi: `ctx.form` is the validated form.
import { register, RegisterFails, type RegisterHandler } from 'fudic:components/user-form';

export const alta = ((ctx) => {
  const person = ctx.form.$value();
  if (person.name.trim().toLowerCase() === 'admin') throw RegisterFails.reserved();
  return { id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', name: person.name, active: true, role: 'member' };
}) satisfies RegisterHandler;

register.handle(alta);
