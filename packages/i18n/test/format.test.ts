import { afterEach, describe, expect, it } from 'vitest';
import { $format } from '../src/runtime/index.js';
import { currency, date, list, number, percent, relativeTime } from '../src/index.js';

const NBSP = ' ';

describe('$format (§4.4)', () => {
  it('currency("EUR") with 3.5 is "3,50 €" in es and "€3.50" in en (criterion 20)', () => {
    const euros = currency('EUR');

    expect($format(euros, 3.5, 'es')).toBe(`3,50${NBSP}€`);
    expect($format(euros, 3.5, 'en')).toBe('€3.50');
  });

  it('formats every kind', () => {
    const at = Date.UTC(2026, 0, 2, 12);
    expect($format(date({ dateStyle: 'medium', timeZone: 'UTC' }), at, 'en')).toBe('Jan 2, 2026');
    expect($format(date({ dateStyle: 'long', timeZone: 'UTC' }), new Date(at), 'es')).toBe('2 de enero de 2026');
    expect($format(number(), 1234.5, 'en')).toBe('1,234.5');
    expect($format(number(), 12345678901234567890n, 'en')).toBe('12,345,678,901,234,567,890');
    expect($format(percent(), 0.25, 'en')).toBe('25%');
    expect($format(relativeTime('day'), -1, 'en')).toBe('1 day ago');
    expect($format(relativeTime('day', { numeric: 'auto' }), -1, 'en')).toBe('yesterday');
    expect($format(list(), ['a', 'b', 'c'], 'en')).toBe('a, b, and c');
    expect($format(list({ type: 'disjunction' }), ['a', 'b'], 'es')).toBe('a o b');
  });

  it('a date preset honours its timeZone, not the machine one', () => {
    const at = Date.UTC(2026, 0, 1, 23, 30);
    const madrid = date({ dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' });

    // The space before AM is U+0020 or U+202F depending on the ICU version.
    expect($format(madrid, at, 'en')).toMatch(/^1\/2\/26, 12:30\sAM$/u);
  });
});

describe('one Intl formatter per (preset, locale) (criterion 24)', () => {
  const Original = Intl.NumberFormat;
  afterEach(() => {
    Intl.NumberFormat = Original;
  });

  function count(): { created: number } {
    const counter = { created: 0 };
    Intl.NumberFormat = new Proxy(Original, {
      construct(target, args: ConstructorParameters<typeof Original>) {
        counter.created++;
        return new target(...args);
      },
    });
    return counter;
  }

  it('a hundred calls with the same preset and locale build one Intl.NumberFormat', () => {
    const counter = count();
    const euros = currency('EUR');

    for (let i = 0; i < 100; i++) $format(euros, i, 'es');

    expect(counter.created).toBe(1);
  });

  it('another locale, or another preset with equal options, builds its own', () => {
    const counter = count();
    const a = number();
    const b = number();

    $format(a, 1, 'es');
    $format(a, 2, 'en');
    $format(a, 3, 'es');
    $format(b, 4, 'es');

    expect(counter.created).toBe(3);
  });
});
