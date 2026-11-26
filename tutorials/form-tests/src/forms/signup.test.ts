import { beforeEach, expect, test } from 'vitest';
import { signupForm } from 'fudic:forms/signup';

beforeEach(() => {
  signupForm.$reset();
});

test('asks for an alias', async () => {
  expect(await signupForm.$validate()).toBe(false);
  expect(signupForm.alias.message()).toBe('Choose an alias.');
});

test('refuses capitals and spaces', async () => {
  signupForm.alias.set('Ada Lovelace');
  expect(await signupForm.$validate()).toBe(false);
  expect(signupForm.alias.message()).toBe('Only lowercase letters, digits and hyphens.');
});
