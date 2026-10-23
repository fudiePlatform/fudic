// The form a `.fudapi` would declare, built as what fudic generates of it does (SDD-60 §3.10).
import { form, required, str } from '@fudic/forms/contract';

export const signupForm = form({
  alias: str('', [required], { messages: { required: () => 'Write an alias.' } }),
  bio: str(''),
});
