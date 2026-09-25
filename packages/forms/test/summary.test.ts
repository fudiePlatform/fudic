/**
 * BUG-42 §6.A, criteria 9–11 — a group's own texts, a summary that says everything, and the
 * list a summary with `fields` paints.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import { internalsOf } from '../src/internals.js';
import { setMessages } from '../src/messages.js';
import { allFailures } from '../src/run-rule.js';
import { required } from '../src/validators/required.js';
import type { AnyForm, AnyNode } from '../src/types.js';

afterEach(() => {
  setMessages({});
});

/** The example of BUG-42 §0.1, trimmed to what the summary looks at. */
const userForm = () =>
  form(
    {
      name: control('', [required], { messages: { required: () => 'Escribe tu nombre.' } }),
      alias: control(''),
      acceso: group(
        {
          clave: control('', [required], { messages: { required: () => 'Elige una contraseña.' } }),
          repetir: control(''),
        },
        [(v) => (v.clave === v.repetir ? null : { mismatch: true })],
        { messages: { mismatch: () => 'Las contraseñas no coinciden.' } },
      ),
    },
    {
      summary: (f) => {
        const found: Record<string, true> = {};
        if (f.alias() !== '' && f.alias() === f.name()) found.sameAsName = true;
        if (f.name() !== '' && f.acceso.clave().includes(f.name())) found.keyHasName = true;
        return Object.keys(found).length > 0 ? found : null;
      },
      messages: {
        sameAsName: () => 'El alias no puede ser tu nombre.',
        keyHasName: () => 'La contraseña no puede contener tu nombre.',
      },
    },
  );

const submit = (f: AnyForm): void => {
  internalsOf(f as unknown as AnyNode).markSubmitted();
};

describe('group() with options (criterion 9)', () => {
  it('words its own summary, ahead of setMessages', async () => {
    setMessages({ mismatch: () => 'global' });
    const f = userForm();
    f.acceso.clave.set('a');
    await f.$validate();
    expect(f.acceso.$message()).toBe('Las contraseñas no coinciden.');
  });

  it('without its own text, setMessages, and then the code', async () => {
    const f = form({ g: group({ a: control('x') }, [() => ({ odd: true })]) });
    await f.$validate();
    expect(f.g.$message()).toBe('odd');
    setMessages({ odd: () => 'global' });
    expect(f.g.$message()).toBe('global');
  });
});

describe('a summary says everything (criterion 10)', () => {
  it('both texts of the §0.1 rule, the first as $message, both keys in $summary', async () => {
    const f = userForm();
    f.name.set('pedro');
    f.alias.set('pedro');
    f.acceso.clave.set('pedro1234');
    f.acceso.repetir.set('pedro1234');
    await f.$validate();

    expect(f.$messages()).toEqual([
      'El alias no puede ser tu nombre.',
      'La contraseña no puede contener tu nombre.',
    ]);
    expect(f.$message()).toBe('El alias no puede ser tu nombre.');
    expect(f.$summary()).toEqual({ sameAsName: true, keyHasName: true });
  });

  it('a group with two failing rules brings both, and the first to name a key keeps it', async () => {
    const f = form({
      g: group({ a: control('') }, [() => ({ one: 1 }), () => ({ one: 2, two: true })]),
    });
    await f.$validate();
    expect(f.g.$summary()).toEqual({ one: 1, two: true });
    expect(f.g.$messages()).toEqual(['one', 'two']);
  });

  it('nothing to say: [] and an empty $message', () => {
    const f = userForm();
    expect(f.$messages()).toEqual([]);
    expect(f.$message()).toBe('');
  });
});

describe('allFailures', () => {
  const root = form({}) as unknown as AnyForm;

  it('hands back the synchronous part at once and the union later', async () => {
    const { now, later } = allFailures<number>(
      [() => ({ a: true }), async () => ({ b: true })],
      0,
      root,
    );
    expect(now).toEqual({ a: true });
    expect(await later).toEqual({ a: true, b: true });
  });

  it('with no rule failing, null and no promise', () => {
    expect(allFailures<number>([() => null], 0, root)).toEqual({ now: null });
  });

  it('a summary publishes what is known now, and the rest when it answers', async () => {
    const f = form({ g: group({ a: control('') }, [() => ({ now: true }), async () => ({ later: true })]) });
    const run = f.$validate();
    expect(f.g.$summary()).toEqual({ now: true });
    await run;
    expect(f.g.$summary()).toEqual({ now: true, later: true });
  });

  it('only an asynchronous rule failing: nothing on record until it answers', async () => {
    const f = form({ g: group({ a: control('') }, [async () => ({ later: true })]) });
    const run = f.$validate();
    expect(f.g.$summary()).toBeNull();
    await run;
    expect(f.g.$summary()).toEqual({ later: true });
  });

  it('an overtaken pass publishes nothing', async () => {
    let n = 0;
    const f = form({
      g: group({ a: control('') }, [async () => ((n += 1) === 1 ? { first: true } : null)]),
    });
    const first = f.$validate();
    const second = f.$validate();
    await Promise.all([first, second]);
    expect(f.g.$summary()).toBeNull();
  });
});

describe('$issues and $submitted (criterion 11)', () => {
  it('before a submit, only its own texts', async () => {
    const f = userForm();
    f.name.set('pedro');
    f.alias.set('pedro');
    f.$touch();
    await f.$validate();
    expect(f.$submitted()).toBe(false);
    expect(f.$issues()).toEqual([{ path: '', message: 'El alias no puede ser tu nombre.' }]);
  });

  it('after one, the visible errors below in declaration order, a group ahead of its fields', async () => {
    const f = userForm();
    f.acceso.repetir.set('x');
    await f.$validate();
    f.$touch();
    submit(f);

    expect(f.$submitted()).toBe(true);
    expect(f.acceso.$submitted()).toBe(true);
    expect(f.$issues()).toEqual([
      { path: 'name', message: 'Escribe tu nombre.' },
      { path: 'acceso', message: 'Las contraseñas no coinciden.' },
      { path: 'acceso.clave', message: 'Elige una contraseña.' },
    ]);
    expect(f.acceso.$issues()).toEqual([
      { path: '', message: 'Las contraseñas no coinciden.' },
      { path: 'clave', message: 'Elige una contraseña.' },
    ]);
  });

  it('a corrected field leaves the list', async () => {
    const f = userForm();
    await f.$validate();
    f.$touch();
    submit(f);
    f.name.set('pedro');
    await f.name.validate();
    expect(f.$issues().map((i) => i.path)).not.toContain('name');
  });

  it('an error nobody can see yet is not listed', async () => {
    const f = userForm();
    await f.$validate();
    submit(f);
    expect(f.$issues()).toEqual([]);
  });

  it('$reset and $set clear it', () => {
    const f = userForm();
    submit(f);
    f.$reset();
    expect(f.$submitted()).toBe(false);
    submit(f);
    f.$set({ name: '', alias: '', acceso: { clave: '', repetir: '' } });
    expect(f.$submitted()).toBe(false);
    expect(f.acceso.$submitted()).toBe(false);
  });
});
