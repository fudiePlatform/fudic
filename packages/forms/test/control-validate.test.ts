/**
 * BUG-41 §6, criteria 1–4 — the model half of «a corrected field loses its error»: a control
 * that validates itself against the root of its form, and the text of an error worded by the
 * control that owns it.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { effect } from '@fudic/core';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import { errorText, setMessages } from '../src/messages.js';
import { str } from '../src/typed/str.js';
import { required } from '../src/validators/required.js';
import type { Validator } from '../src/types.js';

afterEach(() => {
  setMessages({});
});

/** A rule that answers when told to, so two overlapping runs can be resolved out of order. */
function deferred(): {
  rule: Validator<string>;
  answer: (i: number, e: Record<string, unknown> | null) => void;
} {
  const pending: ((e: Record<string, unknown> | null) => void)[] = [];
  return {
    rule: () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }),
    answer: (i, e) => {
      pending[i]!(e);
    },
  };
}

describe('control.validate() (criterion 1)', () => {
  it('validates THAT control and no other, and answers whether it is valid', async () => {
    const f = form({ a: control('', [required]), b: control('', [required]) });

    expect(await f.a.validate()).toBe(false);
    expect(f.a.errors()).toEqual({ required: true });
    expect(f.b.errors()).toBeNull();

    f.a.set('x');
    expect(await f.a.validate()).toBe(true);
    expect(f.a.errors()).toBeNull();
  });

  it('hands its rules the root of the OUTERMOST form, through a group', async () => {
    let seen: unknown;
    const rule: Validator<string> = (_, root) => {
      seen = root;
      return null;
    };
    const f = form({ seo: group({ canonical: control('', [rule]) }) });

    await f.seo.canonical.validate();
    expect(seen).toBe(f);
  });

  it('skips the server-only rules unless asked for them, like `$validate`', async () => {
    const { serverValidator } = await import('../src/validators/server.js');
    const f = form({ a: control('', [serverValidator(() => ({ taken: true }))]) });

    expect(await f.a.validate()).toBe(true);
    expect(await f.a.validate({ server: true })).toBe(false);
  });

  it('a control that belongs to no form has no root to validate against', async () => {
    await expect(control('').validate()).rejects.toThrow(TypeError);
  });

  it('a typed control inside a form validates like any other', async () => {
    const f = form({ t: str('', [required]) });
    expect(await f.t.validate()).toBe(false);
  });
});

describe('the epoch still decides (criterion 2)', () => {
  it('of two overlapping runs, only the one for the CURRENT value publishes', async () => {
    const { rule, answer } = deferred();
    const f = form({ a: control('', [rule]) });

    f.a.set('ab');
    const first = f.a.validate();
    f.a.set('abc');
    const second = f.a.validate();

    // The newer run answers first, the older one last: the older one must not overwrite it.
    answer(1, null);
    await second;
    answer(0, { stale: true });
    await first;

    expect(f.a.errors()).toBeNull();
  });

  it('a form-level summary overtaken by a newer pass publishes nothing', async () => {
    const { rule, answer } = deferred();
    const f = form({ a: control('') }, { summary: () => rule('', undefined as never) });

    const first = f.$validate();
    const second = f.$validate();
    answer(1, null);
    await second;
    answer(0, { stale: true });
    await first;

    expect(f.$summary()).toBeNull();
  });
});

describe('message() (criterion 3)', () => {
  it('the control’s own text wins, then `setMessages`, then the rule’s code', async () => {
    setMessages({ required: () => 'Falta', minLength: () => 'Corto' });
    const f = form({
      own: control('', [required], { messages: { required: () => 'Pon tu nombre' } }),
      global: control('', [required]),
      bare: control('', [() => ({ weird: true })]),
    });
    await f.$validate();

    expect(f.own.message()).toBe('Pon tu nombre');
    expect(f.global.message()).toBe('Falta');
    expect(f.bare.message()).toBe('weird');
  });

  it('is empty with no error', () => {
    const f = form({ a: control('') });
    expect(f.a.message()).toBe('');
  });

  it('`errorText` is still the global layer alone, for whoever words an error by hand', () => {
    setMessages({ required: () => 'Falta' });
    expect(errorText({ required: true })).toBe('Falta');
    expect(errorText({ weird: true })).toBe('weird');
  });

  it('is tracked: an effect that reads it runs again when the error changes', async () => {
    const f = form({ a: control('', [required], { messages: { required: () => 'Falta' } }) });
    const seen: string[] = [];
    const off = effect(() => {
      seen.push(f.a.message());
    });

    await f.$validate();
    f.a.set('x');
    await f.a.validate();
    off();

    expect(seen).toEqual(['', 'Falta', '']);
  });

  it('survives the clone `form()` makes of a typed control', async () => {
    const f = form({ t: str('', [required], { messages: { required: () => 'Texto' } }) });
    await f.$validate();
    expect(f.t.message()).toBe('Texto');
  });
});

describe('$message() (criterion 4)', () => {
  it('words the summary with the form’s own texts, then the global ones', async () => {
    setMessages({ empty: () => 'Global' });
    const own = form(
      { a: control('') },
      { summary: () => ({ empty: true }), messages: { empty: () => 'Rellena algo' } },
    );
    const global = form({ a: control('') }, { summary: () => ({ empty: true }) });
    await own.$validate();
    await global.$validate();

    expect(own.$message()).toBe('Rellena algo');
    expect(global.$message()).toBe('Global');
  });

  it('is empty with no summary', () => {
    expect(form({ a: control('') }).$message()).toBe('');
  });
});
