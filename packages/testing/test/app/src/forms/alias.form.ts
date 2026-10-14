import { form, required, serverValidator, str } from '@fudic/forms';
import { aliasTaken } from '../data/aliases';
import { TAKEN } from './messages';

export * from './messages';

export const aliasForm = form({
  alias: str(
    '',
    [required, serverValidator(async (v) => ((await aliasTaken(String(v))) ? { taken: true } : null))],
    { messages: { required: () => 'Write an alias.', taken: () => TAKEN } },
  ),
});
