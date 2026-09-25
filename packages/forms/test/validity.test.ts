/**
 * BUG-42 §6.A, criteria 1–8 — the validity: silent, reactive, and the author's policy.
 *
 * Validity and errors are two readings. Every test here that reads `valid()` or `$valid()` also
 * checks, somewhere, that the errors did NOT move: that is the half a view relies on.
 */

import { effect } from '@fudic/core';
import { describe, expect, it } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import { asyncValidator } from '../src/validators/async.js';
import { minLength } from '../src/validators/min-length.js';
import { required } from '../src/validators/required.js';
import { serverValidator } from '../src/validators/server.js';
import { Validity } from '../src/validity.js';
import type { Errors } from '../src/types.js';

/** A promise the test resolves by hand. */
function deferred(): { promise: Promise<Errors | null>; resolve: (e: Errors | null) => void } {
  let resolve!: (e: Errors | null) => void;
  const promise = new Promise<Errors | null>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Validity.Rules (criterion 1)', () => {
  it('an empty required is invalid before anything validated, and nothing is published', () => {
    const f = form({ name: control('', [required]) }, { validity: Validity.Rules });

    expect(f.$valid()).toBe(false);
    expect(f.name.valid()).toBe(false);
    expect(f.$errors()).toBeNull();
    expect(f.name.touched()).toBe(false);
  });

  it('turns valid as soon as the value obeys the rules', () => {
    const f = form({ name: control('', [required]) }, { validity: Validity.Rules });
    f.name.set('pedro');
    expect(f.$valid()).toBe(true);
  });
});

describe('Validity.Interacted (criterion 2)', () => {
  it('is the default, and a form nobody touched is valid', () => {
    const f = form({ name: control('', [required]) });
    expect(f.$valid()).toBe(true);
  });

  it('counts a control once it is touched', () => {
    const f = form({ name: control('', [required]) });
    f.name.touch();
    expect(f.$valid()).toBe(false);
  });

  it('counts a control written and deleted, though it is no longer dirty', () => {
    const f = form({ name: control('', [required]) });
    f.name.set('abc');
    expect(f.$valid()).toBe(true);
    f.name.set('');
    expect(f.name.dirty()).toBe(false);
    expect(f.$valid()).toBe(false);
  });

  it('forgets the interaction on reset and on a load', () => {
    const f = form({ name: control('', [required]) });
    f.name.set('abc');
    f.name.set('');
    f.$reset();
    expect(f.$valid()).toBe(true);
    f.name.set('x');
    f.$set({ name: '' });
    expect(f.$valid()).toBe(true);
  });
});

describe('silent (criterion 3)', () => {
  it('reading publishes nothing, touches nothing and changes no message', () => {
    const f = form({ name: control('', [required]) }, { validity: Validity.Rules });
    f.name.valid();
    f.$valid();
    expect(f.name.errors()).toBeNull();
    expect(f.name.touched()).toBe(false);
    expect(f.name.message()).toBe('');
    expect(f.$summary()).toBeNull();
  });
});

describe('tracked (criterion 4)', () => {
  it('re-runs an effect on a write, on a touch and on the field a cross rule reads', () => {
    const f = form({
      a: control('', [required]),
      b: control('x', [(v: string, root: { a: () => string }) => (v === root.a() ? { same: true } : null)]),
    });
    const seen: boolean[] = [];
    const stop = effect(() => {
      const now = f.$valid();
      if (seen.at(-1) !== now) seen.push(now);
    });

    f.a.touch(); // counts now, and it is empty
    f.a.set('y'); // valid again
    f.b.touch(); // b counts: 'x' vs 'y', fine — no change
    f.a.set('x'); // b's rule reads a: now the same
    stop();

    expect(seen).toEqual([true, false, true, false]);
  });
});

describe('groups (criterion 5)', () => {
  const twice = () =>
    form({
      acceso: group(
        { clave: control(''), repetir: control('') },
        [(v) => (v.clave === v.repetir ? null : { mismatch: true })],
      ),
    });

  it('a group whose own rule fails makes the root invalid, which $errors and $summary never saw', () => {
    const f = twice();
    f.acceso.clave.set('a');
    expect(f.$errors()).toBeNull();
    expect(f.$summary()).toBeNull();
    expect(f.acceso.$valid()).toBe(false);
    expect(f.$valid()).toBe(false);
  });

  it('its own rules do not count while nothing below does, under Interacted', () => {
    const f = form({
      g: group({ a: control('') }, [() => ({ always: true })]),
    });
    expect(f.$valid()).toBe(true);
    f.g.a.touch();
    expect(f.$valid()).toBe(false);
  });

  it('they count from the start under Rules', () => {
    const f = form({ g: group({ a: control('') }, [() => ({ always: true })], { validity: Validity.Rules }) });
    expect(f.$valid()).toBe(false);
  });

  it('the summary rule counts like any own rule', () => {
    const f = form(
      { a: control('') },
      { summary: (root) => (root.a() === 'no' ? { nope: true } : null) },
    );
    f.a.set('no');
    expect(f.$valid()).toBe(false);
    f.a.set('yes');
    expect(f.$valid()).toBe(true);
  });

  it('server-only own rules are not run on the client', () => {
    const f = form({ g: group({ a: control('') }, [serverValidator(() => ({ taken: true }))]) });
    f.g.a.touch();
    expect(f.$valid()).toBe(true);
  });
});

describe('asynchronous rules (criterion 6)', () => {
  it('a marked rule is never called by the validity, and is pending until it answers', async () => {
    let calls = 0;
    const late = deferred();
    const f = form({
      alias: control('', [
        asyncValidator(() => {
          calls += 1;
          return late.promise;
        }),
      ]),
    });
    f.alias.set('pedro');
    expect(f.alias.valid()).toBe(false);
    expect(calls).toBe(0);

    const run = f.alias.validate();
    expect(calls).toBe(1);
    expect(f.alias.valid()).toBe(false);
    late.resolve(null);
    await run;
    expect(f.alias.valid()).toBe(true);
    expect(calls).toBe(1);
  });

  it('a failing verdict is on record and counts', async () => {
    const f = form({ alias: control('', [asyncValidator(async () => ({ taken: true }))]) });
    f.alias.set('pedro');
    await f.alias.validate();
    expect(f.alias.valid()).toBe(false);
  });

  it('a verdict for an old value does not count', async () => {
    const f = form({ alias: control('', [asyncValidator(async () => null)]) });
    f.alias.set('pedro');
    await f.alias.validate();
    expect(f.alias.valid()).toBe(true);
    f.alias.set('pedra');
    expect(f.alias.valid()).toBe(false);
  });

  it('a marked rule that answers at once is settled at once', () => {
    const f = form({ alias: control('', [asyncValidator(() => null)]) });
    f.alias.set('pedro');
    void f.alias.validate();
    expect(f.alias.valid()).toBe(true);
  });

  it('an unmarked rule that answers with a promise is pending', () => {
    const f = form({ alias: control('', [async () => null]) });
    f.alias.set('pedro');
    expect(f.alias.valid()).toBe(false);
  });

  it('an asynchronous rule of a group is pending until the group validates', async () => {
    const f = form({ g: group({ a: control('') }, [asyncValidator(async () => null)]) });
    f.g.a.set('x');
    expect(f.$valid()).toBe(false);
    await f.$validate();
    expect(f.$valid()).toBe(true);
  });
});

describe('a 422 (criterion 7)', () => {
  it('leaves the control invalid until its value moves', () => {
    const f = form({ alias: control('pedro') });
    f.$setErrors({ alias: { taken: true } });
    expect(f.alias.valid()).toBe(false);
    f.alias.set('pedra');
    expect(f.alias.valid()).toBe(true);
  });

  it('a form-level one counts until a value below moves', () => {
    const f = form({ alias: control('pedro') });
    f.alias.touch();
    f.$setErrors({}, { conflict: true });
    expect(f.$valid()).toBe(false);
    f.alias.set('pedra');
    expect(f.$valid()).toBe(true);
  });
});

describe('resolving the policy (criterion 8)', () => {
  it('the control wins over the form', () => {
    const f = form(
      { a: control('', [required], { validity: Validity.Interacted }) },
      { validity: Validity.Rules },
    );
    expect(f.a.valid()).toBe(true);
  });

  it('a nested form wins over the one outside, and inherits it when it chose none', () => {
    const f = form(
      {
        inner: group({ a: control('', [required]) }, [], { validity: Validity.Interacted }),
        plain: group({ b: control('', [required]) }),
      },
      { validity: Validity.Rules },
    );
    expect(f.inner.a.valid()).toBe(true);
    expect(f.plain.b.valid()).toBe(false);
  });

  it('with nothing chosen, Interacted', () => {
    expect(form({ a: control('', [required]) }).a.valid()).toBe(true);
  });
});

describe('a control with no form', () => {
  it('has no root to run its rules with', () => {
    const c = control('', [minLength(3)], { validity: Validity.Rules });
    expect(() => c.valid()).toThrow(/control\.valid: this control belongs to no form/u);
  });
});
