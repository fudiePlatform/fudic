import { form, required, str } from '@fudic/forms';

export const signupForm = form({
  alias: str('', [required], { messages: { required: () => 'Write an alias.' } }),
  bio: str(''),
});
