/**
 * The six rules that ship with the package, plus `validator` and `serverValidator`.
 *
 * Two behaviours are checked on every one of them, because they are what makes a
 * form usable rather than annoying: an EMPTY control is `required`'s business and
 * nobody else's, and a rule never throws on the empty value.
 */

import { describe, expect, it, vi } from 'vitest';
import { control } from '../src/control.js';
import { form } from '../src/form.js';
import { isServerOnly } from '../src/server-flag.js';
import { max } from '../src/validators/max.js';
import { maxLength } from '../src/validators/max-length.js';
import { min } from '../src/validators/min.js';
import { minLength } from '../src/validators/min-length.js';
import { pattern } from '../src/validators/pattern.js';
import { required } from '../src/validators/required.js';
import { serverValidator } from '../src/validators/server.js';
import { validator } from '../src/validators/validator.js';
import type { AnyForm } from '../src/types.js';

const root = form({ a: control(0) }) as unknown as AnyForm;

describe('required', () => {
  it('rejects the empty string and null, and accepts false and zero', () => {
    expect(required('', root)).toEqual({ required: true });
    expect(required(null, root)).toEqual({ required: true });
    expect(required(false, root)).toBeNull();
    expect(required(0, root)).toBeNull();
    expect(required('a', root)).toBeNull();
  });
});

describe('minLength / maxLength', () => {
  it('measure strings and lists alike', () => {
    expect(minLength(3)('ab', root)).toEqual({ minLength: 3 });
    expect(minLength(3)('abc', root)).toBeNull();
    expect(minLength(2)(['a'], root)).toEqual({ minLength: 2 });
    expect(maxLength(2)('abc', root)).toEqual({ maxLength: 2 });
    expect(maxLength(2)('ab', root)).toBeNull();
    expect(maxLength(1)(['a', 'b'], root)).toEqual({ maxLength: 1 });
  });

  it('leave the empty control alone', () => {
    expect(minLength(3)('', root)).toBeNull();
    expect(minLength(3)(null, root)).toBeNull();
    expect(minLength(1)([], root)).toBeNull();
    expect(maxLength(0)('', root)).toBeNull();
    expect(maxLength(0)(null, root)).toBeNull();
  });
});

describe('min / max', () => {
  it('judge numbers', () => {
    expect(min(1)(0, root)).toEqual({ min: 1 });
    expect(min(1)(1, root)).toBeNull();
    expect(max(10)(11, root)).toEqual({ max: 10 });
    expect(max(10)(10, root)).toBeNull();
  });

  it('leave the empty control alone, which `null < 1` would not', () => {
    expect(min(1)(null, root)).toBeNull();
    expect(max(10)(null, root)).toBeNull();
  });
});

describe('pattern', () => {
  it('matches, and skips the empty control', () => {
    const https = pattern(/^https:\/\//);
    expect(https('http://x', root)).toEqual({ pattern: '^https:\\/\\/' });
    expect(https('https://x', root)).toBeNull();
    expect(https('', root)).toBeNull();
    expect(https(null, root)).toBeNull();
  });

  it('drops the global flag, so the same value does not alternate', () => {
    const digits = pattern(/\d+/g);
    expect(digits('123', root)).toBeNull();
    // With /g kept, `lastIndex` would survive and this second call would fail.
    expect(digits('123', root)).toBeNull();
  });
});

describe('validator', () => {
  it('is identity, and hands the rule back untouched', () => {
    const rule = (): null => null;
    expect(validator(rule)).toBe(rule);
  });
});

describe('serverValidator (§6.12)', () => {
  it('marks the rule, and only that rule', () => {
    const plain = validator<string>(() => null);
    const guarded = serverValidator<string>(() => null);

    expect(isServerOnly(guarded)).toBe(true);
    expect(isServerOnly(plain)).toBe(false);
  });

  it('does not run on the client and does run on the server', async () => {
    const body = vi.fn(() => ({ taken: true }));
    const f = form({ slug: control('ocupado', [serverValidator<string>(body)]) });

    expect(await f.$validate()).toBe(true);
    expect(body).not.toHaveBeenCalled();
    expect(f.slug.errors()).toBeNull();

    expect(await f.$validate({ server: true })).toBe(false);
    expect(body).toHaveBeenCalledTimes(1);
    expect(f.slug.errors()).toEqual({ taken: true });
  });

  it('the client rules still run alongside it', async () => {
    const f = form({
      slug: control('', [required, serverValidator<unknown>(() => ({ taken: true }))]),
    });

    expect(await f.$validate()).toBe(false);
    expect(f.slug.errors()).toEqual({ required: true });
  });
});
