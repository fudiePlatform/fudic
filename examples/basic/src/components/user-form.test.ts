import { beforeEach, expect, test, vi } from 'vitest';
import { mount } from '@fudic/testing';
import { personForm } from 'fudic:components/user-form';
import { login, logout } from 'fudic:routes/usuarios';
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
});

/**
 * The form, mounted, and signed in as `user` the way a page signs in: `login` sets the session
 * cookie and the jar carries it on every call after. Without `user`, nobody is.
 */
async function mounted(user?: string) {
  const t = await mount(UserForm);
  if (user !== undefined) await login({ user });
  return t;
}

/** Fill the form a person would, with `email`. */
async function fill(t: Awaited<ReturnType<typeof mount>>, email: string): Promise<void> {
  await t.type(t.getByLabelText('Nombre'), 'Pedro');
  await t.type(t.getByLabelText('Email'), email);
  await t.type(t.getByLabelText('Edad'), '40');
}

test('a taken email: the server says so, and its slot shows it', async () => {
  const t = await mounted('ana');
  await fill(t, 'ana@fudic.dev');
  await t.submit();
  // validate → csrf.client → codec → fetch, with the cookie → dispatch → csrf.server
  // → auth.server → email-taken (emailTaken mocked) → 422 → the error slot.
  expect(emailTaken).toHaveBeenCalledExactlyOnceWith('ana@fudic.dev');
  expect(t.errorOf('Email')).toBe('Ese email ya lo usa otra persona.');
  expect(t.errorOf('Nombre')).toBeNull();
});

test('the browser validates first: an empty name never reaches the server', async () => {
  const t = await mounted('ana');
  await t.type(t.getByLabelText('Email'), 'pedro@fudic.dev');
  await t.submit();
  expect(t.errorOf('Nombre')).toBe('Escribe el nombre.');
  expect(emailTaken).not.toHaveBeenCalled();
});

test('without a session, the server half of auth stops the call before the form', async () => {
  // In and out again: what `logout` sets expires the cookie in the jar.
  const t = await mounted('ana');
  await logout();
  await fill(t, 'ana@fudic.dev');
  await t.submit();
  expect(emailTaken).not.toHaveBeenCalled();
  expect(t.errorOf('Email')).toBeNull();
});

test('a save that goes through: the notice names the person, and the host hears it (SDD-80 criterion 29)', async () => {
  const t = await mounted('ana');
  // `fudic:result` crosses the shadow root: a listener on the host of `user-form` reads the
  // person in its `detail`, which is what `<user-form @fudic:result=@alta>` is handed.
  const carried: unknown[] = [];
  const listener = (e: Event): void => {
    carried.push((e as CustomEvent).detail);
  };
  t.host.addEventListener('fudic:result', listener);
  try {
    await fill(t, 'pedro@fudic.dev');
    await t.submit();
    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({ name: 'Pedro', email: 'pedro@fudic.dev' });
    const id = (carried[0] as { id: number }).id;
    expect(t.query('.aviso')?.textContent).toBe(`Guardado: Pedro (id ${String(id)}).`);
  } finally {
    t.host.removeEventListener('fudic:result', listener);
  }
});
