import { describe, expect, it } from 'vitest';
import { $message } from '../src/runtime/index.js';
import { compileMessage, type CompiledMessage } from '../src/index.js';

function compiled(text: string): CompiledMessage {
  const { value, diagnostics } = compileMessage(text, 'es');
  expect(diagnostics).toEqual([]);
  return value;
}

describe('$message (§4.3)', () => {
  const mensajes = compiled('{count, plural, one {# mensaje} other {# mensajes}}');

  it('a plural in the source language: count 1 is "1 mensaje" (criterion 12)', () => {
    expect($message(mensajes, { count: 1 }, 'es')).toBe('1 mensaje');
    expect($message(mensajes, { count: 3 }, 'es')).toBe('3 mensajes');
  });

  it('# is formatted as a number of the locale', () => {
    expect($message(mensajes, { count: 12345 }, 'es')).toBe('12.345 mensajes');
    expect($message(compiled('{n, plural, other {#}}'), { n: 12345 }, 'en')).toBe('12,345');
  });

  it('=N wins over the category, then the category, then other', () => {
    const m = compiled('{n, plural, =0 {none} =1 {just one} one {one} other {# many}}');

    expect($message(m, { n: 0 }, 'en')).toBe('none');
    expect($message(m, { n: 1 }, 'en')).toBe('just one');
    expect($message(m, { n: 5 }, 'en')).toBe('5 many');
    expect($message(compiled('{n, plural, one {one} other {other}}'), { n: 1 }, 'en')).toBe('one');
  });

  it('a category the message does not write falls to other', () => {
    const m = compiled('{n, plural, one {one} other {other}}');

    // Arabic: 3 is "few", which the message does not have.
    expect(new Intl.PluralRules('ar').select(3)).toBe('few');
    expect($message(m, { n: 3 }, 'ar')).toBe('other');
  });

  it('a bigint or a string value is read as a number', () => {
    expect($message(mensajes, { count: 1n }, 'es')).toBe('1 mensaje');
    expect($message(mensajes, { count: '1' }, 'es')).toBe('1 mensaje');
  });

  it('a missing plural value is 0', () => {
    expect($message(compiled('{n, plural, =0 {zero} other {#}}'), {}, 'en')).toBe('zero');
    expect($message(compiled('{n, plural, other {# x}}'), {}, 'en')).toBe('0 x');
  });

  it('holes are the string of their value, and empty when missing', () => {
    const m = compiled('Hola {name}, tienes {count}');

    expect($message(m, { name: 'Ana', count: 2n }, 'es')).toBe('Hola Ana, tienes 2');
    expect($message(m, {}, 'es')).toBe('Hola , tienes ');
  });

  it('select picks its own case, else other', () => {
    const m = compiled('{g, select, female {ella} male {él} other {elle}}');

    expect($message(m, { g: 'female' }, 'es')).toBe('ella');
    expect($message(m, { g: 'male' }, 'es')).toBe('él');
    expect($message(m, { g: 'x' }, 'es')).toBe('elle');
    expect($message(m, {}, 'es')).toBe('elle');
  });

  it('select never reads an inherited property: "constructor" falls to other', () => {
    const m = compiled('{g, select, a {A} other {other}}');

    expect($message(m, { g: 'constructor' }, 'es')).toBe('other');
    expect($message(m, { g: 'toString' }, 'es')).toBe('other');
  });

  it('# inside a select nested in a plural is the plural value', () => {
    const m = compiled('{n, plural, other {{g, select, a {# a} other {# b}}}}');

    expect($message(m, { n: 7, g: 'a' }, 'en')).toBe('7 a');
    expect($message(m, { n: 8, g: 'z' }, 'en')).toBe('8 b');
  });

  it('tags render their content, and an empty tag nothing', () => {
    const m = compiled('<0>{n, plural, one {# item} other {# items}}</0><1/>!');

    expect($message(m, { n: 2 }, 'en')).toBe('2 items!');
  });
});
