import { describe, expect, test } from 'vitest';
import { mount } from '../src/index.js';
import { queriesOf } from '../src/queries.js';
import * as XCounter from './fixtures/x-counter.fud';
import * as XOwner from './fixtures/x-owner.fud';
import * as XPair from './fixtures/x-pair.fud';
import * as XButtonless from './fixtures/x-buttonless.fud';

describe('criterion 6: queries go down through shadow roots', () => {
  test('an element inside the shadow root of a child', async () => {
    const t = await mount(XOwner);
    expect(t.getByText('from the owner')).toBeInTheDocument();
    expect(t.getByRole('button')).toHaveTextContent('0');
    expect(t.query('p')).toHaveTextContent('from the owner');
    expect(t.root.querySelector('p')).toBeNull();
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
