import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest';
import { DEFAULT_LOCALE } from '@fudic/conventions';
import { currency, date, format, list, locale, number, percent, relativeTime, type Pipe } from '../src/index.js';

const NBSP = ' ';

describe('presets are data, plus format (SDD-71 §3.4)', () => {
  it('date keeps its options, timeZone included', () => {
    const pipe = date({ dateStyle: 'long', timeZone: 'Europe/Madrid' });

    expect(pipe.kind).toBe('date');
    expect(pipe.options).toEqual({ dateStyle: 'long', timeZone: 'Europe/Madrid' });
  });

  it('number defaults to no options and keeps the ones given', () => {
    expect(number()).toMatchObject({ kind: 'number', options: {} });
    expect(number({ maximumFractionDigits: 1 })).toMatchObject({ kind: 'number', options: { maximumFractionDigits: 1 } });
  });

  it('currency adds style and currency', () => {
    expect(currency('EUR').options).toEqual({ style: 'currency', currency: 'EUR' });
    expect(currency('USD', { currencyDisplay: 'code' })).toMatchObject({
      kind: 'currency',
      options: { currencyDisplay: 'code', style: 'currency', currency: 'USD' },
    });
  });

  it('percent adds style', () => {
    expect(percent()).toMatchObject({ kind: 'percent', options: { style: 'percent' } });
    expect(percent({ minimumFractionDigits: 1 }).options).toEqual({ minimumFractionDigits: 1, style: 'percent' });
  });

  it('relativeTime carries its unit inside the options', () => {
    expect(relativeTime('day')).toMatchObject({ kind: 'relative-time', options: { unit: 'day' } });
    expect(relativeTime('hour', { numeric: 'auto' }).options).toEqual({ numeric: 'auto', unit: 'hour' });
  });

  it('list defaults to no options and keeps the ones given', () => {
    expect(list()).toMatchObject({ kind: 'list', options: {} });
    expect(list({ type: 'disjunction' }).options).toEqual({ type: 'disjunction' });
  });

  it('a preset has no name: that is a project pipe\'s', () => {
    expect(number()).not.toHaveProperty('name');
  });

  it('a preset and its options are frozen, and the options are a copy', () => {
    const options = { maximumFractionDigits: 2 };
    const pipe = number(options);
    options.maximumFractionDigits = 5;

    expect(Object.isFrozen(pipe)).toBe(true);
    expect(Object.isFrozen(pipe.options)).toBe(true);
    expect(pipe.options).toEqual({ maximumFractionDigits: 2 });
  });

  it('kind and options are all another backend needs: format does not survive JSON', () => {
    const pipe = date({ dateStyle: 'short', timeZone: 'UTC' });

    expect(typeof pipe.format).toBe('function');
    expect(JSON.parse(JSON.stringify(pipe))).toEqual({ kind: 'date', options: { dateStyle: 'short', timeZone: 'UTC' } });
  });
});

describe('format, with the locale the compiler passes (criteria 1 and 2)', () => {
  it('number() formats 1234.5 as "1,234.5" in DEFAULT_LOCALE', () => {
    expect(number().format(1234.5, DEFAULT_LOCALE)).toBe('1,234.5');
  });

  it('currency("EUR") with 3.5 is "3,50 €" in es and "€3.50" in en', () => {
    const euros = currency('EUR');

    expect(euros.format(3.5, 'es')).toBe(`3,50${NBSP}€`);
    expect(euros.format(3.5, 'en')).toBe('€3.50');
  });

  it('formats every kind', () => {
    const at = Date.UTC(2026, 0, 2, 12);
    expect(date({ dateStyle: 'medium', timeZone: 'UTC' }).format(at, 'en')).toBe('Jan 2, 2026');
    expect(date({ dateStyle: 'long', timeZone: 'UTC' }).format(new Date(at), 'es')).toBe('2 de enero de 2026');
    expect(number().format(12345678901234567890n, 'en')).toBe('12,345,678,901,234,567,890');
    expect(percent().format(0.25, 'en')).toBe('25%');
    expect(relativeTime('day').format(-1, 'en')).toBe('1 day ago');
    expect(relativeTime('day', { numeric: 'auto' }).format(-1, 'en')).toBe('yesterday');
    expect(list().format(['a', 'b', 'c'], 'en')).toBe('a, b, and c');
    expect(list({ type: 'disjunction' }).format(['a', 'b'], 'es')).toBe('a o b');
  });

  it('a date preset honours its timeZone, not the machine one', () => {
    const at = Date.UTC(2026, 0, 1, 23, 30);
    const madrid = date({ dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid' });

    // The space before AM is U+0020 or U+202F depending on the ICU version.
    expect(madrid.format(at, 'en')).toMatch(/^1\/2\/26, 12:30\sAM$/u);
  });

  it('format is a method that works detached from the preset', () => {
    const { format: f } = number();

    expect(f(1234.5, 'en')).toBe('1,234.5');
  });
});

describe('each preset reaches only its own Intl formatter, once per locale', () => {
  const originals = {
    DateTimeFormat: Intl.DateTimeFormat,
    NumberFormat: Intl.NumberFormat,
    RelativeTimeFormat: Intl.RelativeTimeFormat,
    ListFormat: Intl.ListFormat,
  };
  type Name = keyof typeof originals;
  afterEach(() => {
    Object.assign(Intl, originals);
  });

  /** Counts the constructions of every `Intl` formatter a preset could reach. */
  function count(): Record<Name, number> {
    const created: Record<Name, number> = { DateTimeFormat: 0, NumberFormat: 0, RelativeTimeFormat: 0, ListFormat: 0 };
    for (const name of Object.keys(originals) as Name[]) {
      (Intl as unknown as Record<Name, unknown>)[name] = new Proxy(originals[name], {
        construct(target, args: unknown[]) {
          created[name]++;
          return new (target as new (...a: unknown[]) => object)(...args);
        },
      });
    }
    return created;
  }

  it('a hundred calls with the same preset and locale build one Intl.NumberFormat', () => {
    const created = count();
    const euros = currency('EUR');

    for (let i = 0; i < 100; i++) euros.format(i, 'es');

    expect(created.NumberFormat).toBe(1);
  });

  it('another locale, or another preset with equal options, builds its own', () => {
    const created = count();
    const a = number();
    const b = number();

    a.format(1, 'es');
    a.format(2, 'en');
    a.format(3, 'es');
    b.format(4, 'es');

    expect(created.NumberFormat).toBe(3);
  });

  it('building a preset builds no formatter: the first format does', () => {
    const created = count();
    const pipe = list();

    expect(created.ListFormat).toBe(0);
    pipe.format(['a'], 'en');
    expect(created.ListFormat).toBe(1);
  });

  it.each([
    ['date', (): void => void date({ timeZone: 'UTC' }).format(0, 'en'), 'DateTimeFormat'],
    ['number', (): void => void number().format(1, 'en'), 'NumberFormat'],
    ['currency', (): void => void currency('EUR').format(1, 'en'), 'NumberFormat'],
    ['percent', (): void => void percent().format(1, 'en'), 'NumberFormat'],
    ['relativeTime', (): void => void relativeTime('day').format(1, 'en'), 'RelativeTimeFormat'],
    ['list', (): void => void list().format(['a'], 'en'), 'ListFormat'],
  ] as const)('%s builds a %s and no other formatter', (_preset, use, own: Name) => {
    const created = count();

    use();

    expect(created).toEqual({ DateTimeFormat: 0, NumberFormat: 0, RelativeTimeFormat: 0, ListFormat: 0, [own]: 1 });
  });
});

describe('each preset is its own module (SDD-71 §3.4, §4.3)', () => {
  const source = (file: string): string => readFileSync(join(import.meta.dirname, '../src/pipes', file), 'utf8');

  it.each([
    ['date.ts', 'DateTimeFormat'],
    ['number.ts', 'NumberFormat'],
    ['relative-time.ts', 'RelativeTimeFormat'],
    ['list.ts', 'ListFormat'],
  ])('%s names only Intl.%s', (file, own) => {
    const named = [...source(file).matchAll(/Intl\.(\w+Format)\b/gu)].map((m) => m[1]);

    expect(new Set(named)).toEqual(new Set([own]));
  });
});

describe('the types of the presets', () => {
  it('date requires timeZone', () => {
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

  it('format takes the value and the locale, and gives text', () => {
    expectTypeOf(currency('EUR').format).toEqualTypeOf<(value: number | bigint, locale: string) => string>();
  });

  it('Pipe is contravariant: a currency pipe is not a Pipe<string>, but is a Pipe<number>', () => {
    // @ts-expect-error — a currency pipe cannot format a string.
    const wrong: Pipe<string> = currency('EUR');
    const right: Pipe<number> = currency('EUR');

    expect(wrong.kind).toBe(right.kind);
  });

  it('a project pipe is a Pipe with kind "pipe" and a name', () => {
    const initials: Pipe<string> = {
      kind: 'pipe',
      name: 'initials',
      options: {},
      format: (value) => value.split(' ').map((w) => w[0]).join(''),
    };

    expect(initials.format('Ada Lovelace', 'en')).toBe('AL');
  });
});

describe('the names the compiler replaces (SDD-71 §3.4)', () => {
  it('format() reached at runtime says the module escaped the compiler', () => {
    expect(() => format(3.5, currency('EUR'))).toThrow(/^compiled away: /u);
  });

  it('locale outside the compiler is "und", which Intl accepts', () => {
    expect(locale).toBe('und');
    expect(Intl.getCanonicalLocales(locale)).toEqual(['und']);
  });

  it('format() checks the value against the pipe', () => {
    // Never called: format() is compiled away and throws at runtime.
    // @ts-expect-error — a string is not what a currency pipe formats.
    const wrong = (): string => format('3.5', currency('EUR'));
    const right = (): string => format(3.5, currency('EUR'));

    expect(wrong).toThrow(/compiled away/u);
    expect(right).toThrow(/compiled away/u);
  });
});

describe('no @fudic/i18n needed (criterion 2)', () => {
  it('@fudic/core does not depend on @fudic/i18n', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
    const deps = { ...pkg['dependencies'], ...pkg['peerDependencies'], ...pkg['devDependencies'] };

    expect(deps).not.toHaveProperty('@fudic/i18n');
  });
});
