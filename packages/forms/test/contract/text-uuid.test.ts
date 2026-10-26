/**
 * SDD-60 §3.6, §3.9 and criterion 37 (the form's half) — the texts as templates, `messages`
 * instead of `setMessages`, and a `uuid` field with its implicit format check.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { formOf, messages, text, uuid, UUID } from '../../src/contract/index.js';
import { errorText, setMessages } from '../../src/messages.js';
import { required } from '../../src/validators/required.js';

afterEach(() => {
  setMessages({});
});

describe('text', () => {
  it('{n} takes the one argument the error carries', () => {
    expect(text('Mínimo {n} caracteres.')(8)).toBe('Mínimo 8 caracteres.');
  });

  it('{x} takes the field of an object: several parameters, or the {detail} of a problem', () => {
    expect(text('Entre {low} y {high}.')({ low: 1, high: 3 })).toBe('Entre 1 y 3.');
    expect(text('El servidor dice: {detail}')({ detail: 'no' })).toBe('El servidor dice: no');
  });

  it('a text without placeholders is itself; every occurrence is filled', () => {
    expect(text('Escribe tu nombre.')(true)).toBe('Escribe tu nombre.');
    expect(text('{n} y {n}')(2)).toBe('2 y 2');
    expect(text('{n}')(null)).toBe('null');
  });
});

describe('messages', () => {
  it('installs the project\'s texts by code, as setMessages did', () => {
    messages({ required: 'Este campo es obligatorio.', min: 'Al menos {n}.' });
    expect(errorText({ required: true })).toBe('Este campo es obligatorio.');
    expect(errorText({ min: 18 })).toBe('Al menos 18.');
  });
});

describe('uuid', () => {
  const ID = '0190a6b2-7c1e-7d3a-9f00-1a2b3c4d5e6f';

  it('the regex is RFC 9562 textual form, any case', () => {
    expect(UUID.test(ID)).toBe(true);
    expect(UUID.test(ID.toUpperCase())).toBe(true);
    expect(UUID.test('abc')).toBe(false);
    expect(UUID.test(`${ID}0`)).toBe(false);
  });

  it('a uuid field gives its error uuid and lets the empty value pass', async () => {
    const f = formOf({ id: uuid() });
    expect(f.id()).toBe('');
    expect(await f.$validate()).toBe(true);
    f.id.set('abc');
    expect(await f.$validate()).toBe(false);
    expect(f.id.errors()).toEqual({ uuid: true });
    f.id.set(ID.toUpperCase());
    expect(await f.$validate()).toBe(true);
  });

  it('the format goes first; required rejects the empty value; its text comes from range', async () => {
    const f = formOf({
      id: uuid('', [required], { messages: { uuid: text('Eso no es un identificador.') } }),
    });
    expect(await f.$validate()).toBe(false);
    expect(f.id.errors()).toEqual({ required: true });
    f.id.set('x');
    await f.$validate();
    expect(f.id.errors()).toEqual({ uuid: true });
    expect(errorText(f.id.errors()!)).toBe('uuid');
    f.id.set(ID);
    expect(await f.$validate()).toBe(true);
  });

  it('travels as text: a str control on the wire', () => {
    const f = formOf({ id: uuid(ID) });
    expect(f.$value()).toEqual({ id: ID });
  });
});
