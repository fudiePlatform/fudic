/**
 * The entry points, imported the way an application and what fudic generates import them.
 *
 * The rest of the suite reaches into `src/` module by module, which is what keeps
 * a failure pointing at one file. That leaves one thing unchecked, and it is the
 * only thing a consumer ever sees: that `@fudic/forms` resolves, and that every
 * name the package promises is there and is what it says it is.
 *
 * SDD-60 §3.10: the factories, the validators and `form` left the public entry for
 * `./contract`, which only what is generated from a `.fudapi` imports.
 */

import { describe, expect, it } from 'vitest';
import * as forms from '../src/index.js';
import * as contract from '../src/contract/index.js';
import * as dom from '../src/dom/index.js';

const FACTORIES = [
  'form',
  'group',
  'control',
  'validator',
  'serverValidator',
  'asyncValidator',
  'required',
  'minLength',
  'maxLength',
  'min',
  'max',
  'pattern',
  'setMessages',
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

  it('no longer exports what a .fudapi declares (SDD-60 §3.10)', () => {
    for (const name of [...FACTORIES, 'ValidateOn', 'Validity']) {
      expect(name in forms, name).toBe(false);
    }
    expect('setMessages' in dom).toBe(false);
  });

  it('./contract exports every one of them, and each one is callable', () => {
    for (const name of FACTORIES) {
      expect(typeof contract[name], name).toBe('function');
    }
    expect(contract.ValidateOn).toBeDefined();
    expect(contract.Validity).toBeDefined();
  });

  it('builds a working form through ./contract alone', async () => {
    const schema = {
      title: contract.control('', [contract.required, contract.minLength(3)]),
      qty: contract.u8(1, [contract.min(1)]),
      seo: contract.group({ canonical: contract.control('', [contract.pattern(/^https:\/\//)]) }),
    };
    const f = contract.form(schema);

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
