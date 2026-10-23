/**
 * The helpers of a call in the browser: whether its argument is a form, and its URL — the
 * page's params and the app's `base`. The call itself is `contract/fn.ts`'s, and its tests.
 */

import { describe, expect, it } from 'vitest';
import { control, form } from '@fudic/forms/contract';
import { isForm } from '../../src/client/form.js';
import { join, pageParams } from '../../src/client/url.js';

describe('the helpers', () => {
  it('isForm', () => {
    expect(isForm(form({ a: control('') }))).toBe(true);
    expect(isForm({ $validate: 1 })).toBe(false);
    expect(isForm(null)).toBe(false);
    expect(isForm('x')).toBe(false);
  });

  it('pageParams', () => {
    expect(pageParams(undefined, '/', '/x')).toEqual({});
    expect(pageParams('/blog/:slug', '/', '/blog/a')).toEqual({ slug: 'a' });
    expect(pageParams('/blog/:slug', '/', '/blog')).toEqual({});
    expect(pageParams('/a/:x/b/:y', '/base/', '/base/a/1/b/2')).toEqual({ x: '1', y: '2' });
  });

  it('join', () => {
    expect(join('/', '/a')).toBe('/a');
    expect(join('/app/', '/a')).toBe('/app/a');
    expect(join('/app', '/a')).toBe('/app/a');
  });
});
