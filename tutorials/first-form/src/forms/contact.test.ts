import { expect, test } from 'vitest';
import { contactForm } from 'fudic:forms/contact';

test('asks for the name and a valid email', async () => {
  expect(await contactForm.$validate()).toBe(false);
  contactForm.name.set('Ada');
  contactForm.email.set('ada');
  expect(await contactForm.$validate()).toBe(false);
  expect(contactForm.email.message()).toBe('That email does not look valid.');
  contactForm.email.set('ada@example.com');
  expect(await contactForm.$validate()).toBe(true);
});
