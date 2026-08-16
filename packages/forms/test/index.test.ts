/**
 * The entry point, imported the way an application imports it.
 *
 * The rest of the suite reaches into `src/` module by module, which is what keeps
 * a failure pointing at one file. That leaves one thing unchecked, and it is the
 * only thing a consumer ever sees: that `@fudic/forms` resolves, and that every
 * name the package promises is there and is what it says it is.
 */

import { describe, expect, it } from 'vitest';
import * as forms from '../src/index.js';

const FACTORIES = [
  'form',
  'group',
  'control',
  'validator',
  'serverValidator',
  'required',
  'minLength',
  'maxLength',
  'min',
  'max',
  'pattern',
  'u8',
  'i8',
  'u16',
  'i16',
  'u32',
  'i32',
  'f32',
  'f64',
  'bool',
  'str',
  'date',
  'arr',
] as const;

describe('the entry point', () => {
  it('carries its version', () => {
    expect(forms.VERSION).toBe('0.0.1');
  });

  it('exports every name the package promises, and each one is callable', () => {
    for (const name of FACTORIES) {
      expect(typeof forms[name], name).toBe('function');
    }
  });

  it('builds a working form through the public surface alone', async () => {
    const schema = {
      title: forms.control('', [forms.required, forms.minLength(3)]),
      qty: forms.u8(1, [forms.min(1)]),
      seo: forms.group({ canonical: forms.control('', [forms.pattern(/^https:\/\//)]) }),
    };
    const f = forms.form(schema);

    expect(await f.$validate()).toBe(false);
    expect(f.$errors()).toEqual({ title: { required: true } });

    f.$patch({ title: 'ab', seo: { canonical: 'http://x' } });
    expect(await f.$validate()).toBe(false);
    expect(f.$errors()).toEqual({
      title: { minLength: 3 },
      'seo.canonical': { pattern: '^https:\\/\\/' },
    });

    f.$patch({ title: 'abc', seo: { canonical: 'https://x' } });
    expect(await f.$validate()).toBe(true);
    expect(f.$value()).toEqual({ title: 'abc', qty: 1, seo: { canonical: 'https://x' } });
  });
});
