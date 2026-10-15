import { describe, expect, expectTypeOf, it } from 'vitest';
import { currency, date, format, list, number, percent, relativeTime, type Pipe } from '../src/index.js';

describe('presets are data (§4.4)', () => {
  it('date keeps its options, timeZone included', () => {
    expect(date({ dateStyle: 'long', timeZone: 'Europe/Madrid' })).toEqual({
      kind: 'date',
      options: { dateStyle: 'long', timeZone: 'Europe/Madrid' },
    });
  });

  it('number defaults to no options and keeps the ones given', () => {
    expect(number()).toEqual({ kind: 'number', options: {} });
    expect(number({ maximumFractionDigits: 1 })).toEqual({ kind: 'number', options: { maximumFractionDigits: 1 } });
  });

  it('currency adds style and currency', () => {
    expect(currency('EUR')).toEqual({ kind: 'currency', options: { style: 'currency', currency: 'EUR' } });
    expect(currency('USD', { currencyDisplay: 'code' })).toEqual({
      kind: 'currency',
      options: { currencyDisplay: 'code', style: 'currency', currency: 'USD' },
    });
  });

  it('percent adds style', () => {
    expect(percent()).toEqual({ kind: 'percent', options: { style: 'percent' } });
    expect(percent({ minimumFractionDigits: 1 })).toEqual({
      kind: 'percent',
      options: { minimumFractionDigits: 1, style: 'percent' },
    });
  });

  it('relativeTime carries its unit inside the options', () => {
    expect(relativeTime('day')).toEqual({ kind: 'relative-time', options: { unit: 'day' } });
    expect(relativeTime('hour', { numeric: 'auto' })).toEqual({
      kind: 'relative-time',
      options: { numeric: 'auto', unit: 'hour' },
    });
  });

  it('list defaults to no options and keeps the ones given', () => {
    expect(list()).toEqual({ kind: 'list', options: {} });
    expect(list({ type: 'disjunction' })).toEqual({ kind: 'list', options: { type: 'disjunction' } });
  });

  it('a preset and its options are frozen, and the options are a copy', () => {
    const options = { maximumFractionDigits: 2 };
    const pipe = number(options);
    options.maximumFractionDigits = 5;

    expect(Object.isFrozen(pipe)).toBe(true);
    expect(Object.isFrozen(pipe.options)).toBe(true);
    expect(pipe.options).toEqual({ maximumFractionDigits: 2 });
  });

  it('carries no function: it survives a JSON round trip (IDEA-03)', () => {
    const pipe = date({ dateStyle: 'short', timeZone: 'UTC' });

    expect(JSON.parse(JSON.stringify(pipe))).toEqual(pipe);
    expect(pipe).not.toHaveProperty('__in');
  });
});

describe('the types of the presets', () => {
  it('date requires timeZone (criterion 23)', () => {
    // @ts-expect-error — a date without timeZone differs between server and browser.
    expect(() => date({ dateStyle: 'long' })).not.toThrow();
  });

  it('each preset says the value it accepts', () => {
    expectTypeOf(date({ timeZone: 'UTC' })).toEqualTypeOf<Pipe<Date | number>>();
    expectTypeOf(number()).toEqualTypeOf<Pipe<number | bigint>>();
    expectTypeOf(currency('EUR')).toEqualTypeOf<Pipe<number | bigint>>();
    expectTypeOf(percent()).toEqualTypeOf<Pipe<number>>();
    expectTypeOf(relativeTime('day')).toEqualTypeOf<Pipe<number>>();
    expectTypeOf(list()).toEqualTypeOf<Pipe<readonly string[]>>();
  });

  it('Pipe is contravariant: a currency pipe is not a Pipe<string>, but is a Pipe<number>', () => {
    // @ts-expect-error — a currency pipe cannot format a string.
    const wrong: Pipe<string> = currency('EUR');
    const right: Pipe<number> = currency('EUR');

    expect(wrong).toEqual(right);
  });

  it('format() checks the value against the pipe', () => {
    // Never called: format() is compiled away and throws at runtime.
    // @ts-expect-error — a string is not what a currency pipe formats.
    const wrong = (): string => format('3.5', currency('EUR'));
    const right = (): string => format(3.5, currency('EUR'));

    expect(typeof wrong).toBe('function');
    expect(typeof right).toBe('function');
  });

  it('style and currency cannot be overridden through the options', () => {
    // @ts-expect-error — `style` is the preset's, not the author's.
    expect(currency('EUR', { style: 'decimal' }).options['style']).toBe('currency');
    // @ts-expect-error — the same for percent.
    expect(percent({ style: 'decimal' }).options['style']).toBe('percent');
  });
});
