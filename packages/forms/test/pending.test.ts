/**
 * SDD-80 §3.4 and criterion 15: `pending()` of a control and `$pending()` of a form — true from
 * the moment a validation asks an asynchronous rule for the current value until it answers —
 * and the server's `ctx` a validation hands its rules (§3.2).
 */

import { effect } from '@fudic/core';
import { describe, expect, it } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { group } from '../src/group.js';
import type { AnyForm, Errors } from '../src/types.js';
import { markAsync } from '../src/async-flag.js';
import { asyncValidator } from '../src/validators/async.js';

/** An asynchronous rule whose answers the test hands out, one per question, in order. */
function deferred() {
  const waiting: ((e: Errors | null) => void)[] = [];
  const rule = asyncValidator<string>(() => new Promise<Errors | null>((resolve) => waiting.push(resolve)));
  return { rule, answer: (e: Errors | null) => waiting.shift()!(e), asked: () => waiting.length };
}

describe('pending() of a control (criterion 15)', () => {
  it('is false before anything asked, true while the rule is asked, false once it answers', async () => {
    const { rule, answer } = deferred();
    const f = form({ alias: control('', [rule]) });
    expect(f.alias.pending()).toBe(false);
    expect(f.$pending()).toBe(false);

    f.alias.set('admin');
    // The value moved and nothing asked about it yet: nothing is awaited.
    expect(f.alias.pending()).toBe(false);
    const done = f.alias.validate();
    expect(f.alias.pending()).toBe(true);
    expect(f.$pending()).toBe(true);
    // Meanwhile the field and the form are not valid, as before.
    expect(f.alias.valid()).toBe(false);
    expect(f.$valid()).toBe(false);

    answer({ taken: true });
    expect(await done).toBe(false);
    expect(f.alias.pending()).toBe(false);
    expect(f.$pending()).toBe(false);
    expect(f.alias.errors()).toEqual({ taken: true });
  });

  it('is tracked: an effect sees it go up and down', async () => {
    const { rule, answer } = deferred();
    const f = form({ alias: control('', [rule]) });
    const seen: boolean[] = [];
    effect(() => {
      seen.push(f.alias.pending());
    });
    f.alias.set('a');
    const done = f.alias.validate();
    answer(null);
    await done;
    // The changes it went through, whatever re-runs the writes in between cost.
    expect(seen.filter((v, i) => i === 0 || v !== seen[i - 1])).toEqual([false, true, false]);
  });

  it('a new value drops the question in flight: it is not waited for any more', async () => {
    const { rule, answer } = deferred();
    const f = form({ alias: control('', [rule]) });
    f.alias.set('adm');
    const first = f.alias.validate();
    expect(f.alias.pending()).toBe(true);
    f.alias.set('admin');
    expect(f.alias.pending()).toBe(false);
    answer({ taken: true });
    await first;
    // The late answer belongs to another value: nothing is published, nothing is pending.
    expect(f.alias.errors()).toBeNull();
    expect(f.alias.pending()).toBe(false);
  });

  it('a load of the same value also drops it', async () => {
    const { rule, answer } = deferred();
    const f = form({ alias: control('', [rule]) });
    f.alias.set('admin');
    const done = f.alias.validate();
    f.$set({ alias: 'admin' });
    expect(f.alias.pending()).toBe(false);
    answer(null);
    await done;
  });

  it('a rule marked async that answers at once is never pending', async () => {
    const f = form({ alias: control('', [asyncValidator<string>(() => null)]) });
    f.alias.set('a');
    const done = f.alias.validate();
    expect(f.alias.pending()).toBe(false);
    expect(await done).toBe(true);
  });
});

describe('$pending() of a form and a group', () => {
  it('a rule of a group is pending in the group and in the form above it', async () => {
    const { rule, answer } = deferred();
    const f = form({ g: group({ a: control(''), b: control('') }, [rule as never]) });
    expect(f.g.$pending()).toBe(false);
    f.g.a.set('x');
    const done = f.$validate();
    expect(f.g.$pending()).toBe(true);
    expect(f.$pending()).toBe(true);
    // The fields are not what waits.
    expect(f.g.a.pending()).toBe(false);
    answer(null);
    await done;
    expect(f.g.$pending()).toBe(false);
    expect(f.$pending()).toBe(false);
  });

  it('a field pending inside a group makes both pending', async () => {
    const { rule, answer } = deferred();
    const f = form({ g: group({ alias: control('', [rule]) }) });
    f.g.alias.set('x');
    const done = f.$validate();
    expect(f.g.$pending()).toBe(true);
    expect(f.$pending()).toBe(true);
    answer(null);
    await done;
    expect(f.$pending()).toBe(false);
  });
});

describe('the server ctx of a validation (SDD-80 §3.2)', () => {
  /** A rule that writes down the third argument it was called with. */
  const spy = (seen: unknown[]) => (_value: unknown, _root: AnyForm, ctx?: unknown): Errors | null => {
    seen.push(ctx);
    return null;
  };

  it('$validate({ ctx }) hands it to the rules of the fields and to the summary', async () => {
    const fields: unknown[] = [];
    const summary: unknown[] = [];
    const f = form({ a: control('', [spy(fields) as never]) }, { summary: spy(summary) as never });
    const ctx = { user: 'pedro' };
    await f.$validate({ server: true, ctx });
    expect(fields).toEqual([ctx]);
    // The summary is folded into the form's rules as a closure that reads the form: it is not given the ctx.
    expect(summary).toHaveLength(1);
  });

  it('a group rule is given it too, through the watch of an asynchronous one', async () => {
    const seen: unknown[] = [];
    const rule = markAsync(async (_v: unknown, _r: AnyForm, ctx?: unknown): Promise<Errors | null> => {
      seen.push(ctx);
      return null;
    });
    const f = form({ g: group({ a: control('') }, [rule as never]), b: control('', [rule as never]) });
    await f.$validate({ server: true, ctx: 'c' });
    expect(seen).toEqual(['c', 'c']);
  });

  it('control.validate({ ctx }) hands it on; without one the rules get undefined', async () => {
    const seen: unknown[] = [];
    const f = form({ a: control('', [spy(seen) as never]) });
    await f.a.validate({ server: true, ctx: 7 });
    await f.a.validate();
    expect(seen).toEqual([7, undefined]);
  });
});
