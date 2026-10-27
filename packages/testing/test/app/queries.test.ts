/**
 * The queries and gestures over a form: its controls by their label, their error slots, and
 * typing and submitting. Here and not beside the other queries because a form is declared in a
 * `.fudapi`, and this is the project of the package's tests that has contracts.
 */

import { describe, expect, test } from 'vitest';
import { mount } from '../../src/index.js';
import * as XSignup from './src/components/x-signup.fud';

describe('criterion 6: queries go down through shadow roots', () => {
  test('by label, and the role of nothing that is there', async () => {
    const t = await mount(XSignup);
    expect(t.getByLabelText('Alias')).toBe(t.query('#alias'));
    expect(t.queryByRole('dialog')).toBeNull();
    expect(t.queryByRole('status')).toHaveTextContent('0');
    expect(t.query('table')).toBeNull();
  });
});

describe('errorOf', () => {
  test('the error slot of a labelled control: null while empty, its text once it says something', async () => {
    const t = await mount(XSignup);
    expect(t.errorOf('Alias')).toBeNull();
    await t.submit();
    expect(t.errorOf(/alias/iu)).toBe('Write an alias.');
  });

  test('a control with no error slot says so', async () => {
    const t = await mount(XSignup);
    expect(() => t.errorOf('Bio')).toThrow('The control labelled Bio has no error slot');
  });
});

describe('gestures wait for what they set off', () => {
  test('type, clear and blur', async () => {
    const t = await mount(XSignup);
    const alias = t.getByLabelText('Alias') as HTMLInputElement;
    await t.type(alias, 'pedro');
    expect(alias).toHaveValue('pedro');
    await t.clear(alias);
    expect(alias).toHaveValue('');
    await t.blur(alias);
    expect(alias).not.toHaveFocus();
  });

  test('submit the one form under the root, or the one given', async () => {
    const t = await mount(XSignup);
    await t.type(t.getByLabelText('Alias'), 'pedro');
    await t.submit();
    expect(t.getByRole('status')).toHaveTextContent('1');
    await t.submit(t.query('form')!);
    expect(t.getByRole('status')).toHaveTextContent('2');
  });
});
