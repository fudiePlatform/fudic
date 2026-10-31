import { preset, type Pipe } from '../pipe.js';

/** The three presets over `Intl.NumberFormat`: one module, because they share the formatter. */
const numeric = <T extends number | bigint>(kind: 'number' | 'currency' | 'percent', options: object): Pipe<T> =>
  preset<T>(kind, options, (locale, opts) => {
    const f = new Intl.NumberFormat(locale, opts);
    return (value) => f.format(value);
  });

export function number(options: Intl.NumberFormatOptions = {}): Pipe<number | bigint> {
  return numeric('number', options);
}

export function currency(
  code: string,
  options: Omit<Intl.NumberFormatOptions, 'style' | 'currency'> = {},
): Pipe<number | bigint> {
  return numeric('currency', { ...options, style: 'currency', currency: code });
}

export function percent(options: Omit<Intl.NumberFormatOptions, 'style'> = {}): Pipe<number> {
  return numeric('percent', { ...options, style: 'percent' });
}
