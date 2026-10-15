import { describe, expect, it } from 'vitest';
import { currency, format, locale, t } from '../src/index.js';

describe('the names the compiler replaces (§4.3, §4.4)', () => {
  it('t() reached at runtime says the module escaped the compiler', () => {
    expect(() => t('Hola')).toThrow(/^compiled away: /u);
    expect(() => t('Hola {name}', { name: 'Ana' })).toThrow(/compiled away/u);
  });

  it('format() too', () => {
    expect(() => format(3.5, currency('EUR'))).toThrow(/^compiled away: /u);
  });

  it('locale cannot throw on read: it is "und", which Intl accepts', () => {
    expect(locale).toBe('und');
    expect(Intl.getCanonicalLocales(locale)).toEqual(['und']);
  });
});
