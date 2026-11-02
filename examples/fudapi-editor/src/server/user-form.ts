// The handler of components/user-form.fudapi: `ctx.form` is the validated form.
import { conflict } from '@fudic/http';
import { t } from '@fudic/i18n';
import { register, type RegisterHandler } from 'fudic:components/user-form';

export const alta = ((ctx) => {
  const person = ctx.form.$value();
  if (person.name.trim().toLowerCase() === 'admin') throw conflict(t('Ese nombre está reservado.'));
  return { id: '1b4e28ba-2fa1-11d2-883f-0016d3cca427', name: person.name, active: true, role: 'member' };
}) satisfies RegisterHandler;

register.handle(alta);
