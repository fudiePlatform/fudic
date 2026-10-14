import { describe, expect, test } from 'vitest';
import { mount } from '../src/index.js';
import { queriesOf } from '../src/queries.js';
import * as XCounter from './fixtures/x-counter.fud';
import * as XOwner from './fixtures/x-owner.fud';
import * as XPair from './fixtures/x-pair.fud';
import * as XSignup from './fixtures/x-signup.fud';
import * as XButtonless from './fixtures/x-buttonless.fud';

describe('criterion 6: queries go down through shadow roots', () => {
  test('an element inside the shadow root of a child', async () => {
    const t = await mount(XOwner);
    expect(t.getByText('from the owner')).toBeInTheDocument();
    expect(t.getByRole('button')).toHaveTextContent('0');
    expect(t.query('p')).toHaveTextContent('from the owner');
    expect(t.root.querySelector('p')).toBeNull();
  });

  test('by label, and the role of nothing that is there', async () => {
    const t = await mount(XSignup);
    expect(t.getByLabelText('Alias')).toBe(t.query('#alias'));
    expect(t.queryByRole('dialog')).toBeNull();
    expect(t.queryByRole('status')).toHaveTextContent('0');
    expect(t.query('table')).toBeNull();
  });

  test('none, or more than one, is an error that says what was asked', async () => {
    const t = await mount(XPair);
    expect(() => t.getByRole('dialog')).toThrow('Unable to find an element with the role "dialog"');
    expect(() => t.getByRole('status')).toThrow('Found 2 elements for an element with the role "status", expected one');
    expect(() => t.queryByRole('button')).toThrow('Found 2 elements');
    expect(() => t.getByText('nothing')).toThrow('Unable to find an element with the text nothing');
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

  test('an aria-describedby that names nothing in the root', () => {
    document.body.innerHTML = '<label for="x">X</label><input id="x" aria-describedby="gone">';
    expect(() => queriesOf(document.body).errorOf('X')).toThrow('has no error slot');
  });
});

describe('gestures wait for what they set off', () => {
  test('click', async () => {
    const t = await mount(XCounter, { props: { start: 1 } });
    await t.click(t.getByRole('button'));
    expect(t.getByRole('status')).toHaveTextContent('2');
  });

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

  test('submit with no form to pick says so', async () => {
    const pair = await mount(XPair);
    expect(() => pair.submit()).toThrow('submit() needs the form to submit: there are 0 under the root');
  });
});

describe('a form with no submit button', () => {
  test('is submitted as Enter would, once the component is up', async () => {
    const t = await mount(XButtonless);
    await t.type(t.getByLabelText('Search'), 'q');
    await t.submit();
    expect(t.getByRole('status')).toHaveTextContent('1');
  });
});
