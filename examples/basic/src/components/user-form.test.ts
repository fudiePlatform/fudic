import { beforeEach, expect, test, vi } from 'vitest';
import { mount } from '@fudic/testing';
import { personForm } from 'fudic:components/user-form';
import { TOKEN_KEY } from '../browser/auth';
import * as UserForm from './user-form.fud';

// The data edge, mocked: the rule `email-taken` reads it, on the in-memory server.
const emailTaken = vi.hoisted(() => vi.fn());
vi.mock('../data/people', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../data/people')>()),
  emailTaken,
}));

beforeEach(() => {
  // The form is module state: one instance for the whole file, so each test starts it over.
  personForm.$reset();
  emailTaken.mockReset();
  emailTaken.mockImplementation(async (email: string) => email === 'ana@fudic.dev');
  localStorage.setItem(TOKEN_KEY, 'ana');
});

/** Fill the form a person would, with `email`. */
async function fill(t: Awaited<ReturnType<typeof mount>>, email: string): Promise<void> {
  await t.type(t.getByLabelText('Nombre'), 'Pedro');
  await t.type(t.getByLabelText('Email'), email);
  await t.type(t.getByLabelText('Edad'), '40');
}

test('a taken email: the server says so, and its slot shows it', async () => {
  const t = await mount(UserForm);
  await fill(t, 'ana@fudic.dev');
  await t.submit();
  // validate → csrf.client → auth.client → codec → fetch → dispatch → csrf.server
  // → auth.server → email-taken (emailTaken mocked) → 422 → the error slot.
  expect(emailTaken).toHaveBeenCalledExactlyOnceWith('ana@fudic.dev');
  expect(t.errorOf('Email')).toBe('Ese email ya lo usa otra persona.');
  expect(t.errorOf('Nombre')).toBeNull();
});

test('the browser validates first: an empty name never reaches the server', async () => {
  const t = await mount(UserForm);
  await t.type(t.getByLabelText('Email'), 'pedro@fudic.dev');
  await t.submit();
  expect(t.errorOf('Nombre')).toBe('Escribe el nombre.');
  expect(emailTaken).not.toHaveBeenCalled();
});

test('without a token, the server half of auth stops the call before the form', async () => {
  localStorage.removeItem(TOKEN_KEY);
  const t = await mount(UserForm);
  await fill(t, 'ana@fudic.dev');
  await t.submit();
  expect(emailTaken).not.toHaveBeenCalled();
  expect(t.errorOf('Email')).toBeNull();
});
