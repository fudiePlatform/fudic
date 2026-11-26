import { beforeEach, expect, test, vi } from 'vitest';
import { visit } from '@fudic/testing';
import { signupForm } from 'fudic:forms/signup';
import { addUser } from '../server/users';

vi.mock('../server/users', async (importOriginal) => {
  const real = await importOriginal<typeof import('../server/users')>();
  return { ...real, addUser: vi.fn() };
});

beforeEach(() => {
  signupForm.$reset();
  vi.mocked(addUser).mockClear();
});

test('answers /', async () => {
  const page = await visit('/');
  expect(page.status).toBe(200);
});

test('an alias someone has: the server says so under the field', async () => {
  const page = await visit('/');
  await page.type(page.getByLabelText('Alias'), 'ada');
  await page.submit();
  expect(page.errorOf('Alias')).toBe('That alias is already taken.');
  expect(addUser).not.toHaveBeenCalled();
});

test('a free alias is saved', async () => {
  const page = await visit('/');
  await page.type(page.getByLabelText('Alias'), 'ada-l');
  await page.submit();
  expect(page.errorOf('Alias')).toBeNull();
  expect(addUser).toHaveBeenCalledWith('ada-l');
});
