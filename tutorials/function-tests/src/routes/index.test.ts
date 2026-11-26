import { expect, test } from 'vitest';
import { HttpError } from '@fudic/http';
import { respondProblem, visit } from '@fudic/testing';
import { login, secret } from 'fudic:routes/index';

test('answers /', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
});

test('secret refuses whoever has not signed in', async () => {
  await expect(secret()).rejects.toThrow(HttpError);
  await expect(secret()).rejects.toMatchObject({ status: 401, message: 'Sign in first.' });
});

test('secret answers after login', async () => {
  await login({ user: 'ana' });
  expect(await secret()).toBe('The code is 42, ana.');
});

test('the page shows the secret to a signed-in user', async () => {
  const page = await visit('/');
  await login({ user: 'ana' });
  await page.click(page.getByRole('button', { name: 'Read the secret' }));
  expect(page.getByText('The code is 42, ana.')).toBeInTheDocument();
});

test('the page says why when the server refuses', async () => {
  const page = await visit('/');
  await page.click(page.getByRole('button', { name: 'Read the secret' }));
  expect(page.getByRole('alert')).toHaveTextContent('Sign in first.');
});

test('the page says why when the server fails', async () => {
  const page = await visit('/', {
    fetch: () => respondProblem(secret, { status: 503, title: 'Service Unavailable', detail: 'Try again in a minute.' }),
  });
  await page.click(page.getByRole('button', { name: 'Read the secret' }));
  expect(page.getByRole('alert')).toHaveTextContent('Try again in a minute.');
});
