/**
 * `$format` — the runtime piece behind `@(x | pipe)` and `format(x, pipe)` (SDD-58 §4.4).
 *
 * Building an `Intl` formatter is the expensive part, so there is one per (locale, preset). The
 * cache lives in a `WeakMap` keyed by the preset: it is not state of any module of the app, and
 * a preset nobody holds any more takes its formatters with it.
 */

import type { Pipe } from '../pipe.js';

type Formatter = (value: never) => string;

const formatters = new WeakMap<Pipe<never>, Map<string, Formatter>>();

/** Formats `value` with `pipe` in `locale`. One cached Intl formatter per (locale, preset). */
export function $format<T>(pipe: Pipe<T>, value: T, locale: string): string {
  const key = pipe as Pipe<never>;
  let byLocale = formatters.get(key);
  if (byLocale === undefined) {
    byLocale = new Map();
    formatters.set(key, byLocale);
  }
  let formatter = byLocale.get(locale);
  if (formatter === undefined) {
    formatter = formatterOf(pipe.kind, pipe.options, locale);
    byLocale.set(locale, formatter);
  }
  return (formatter as (value: T) => string)(value);
}

function formatterOf(kind: Pipe<never>['kind'], options: Readonly<Record<string, unknown>>, locale: string): Formatter {
  switch (kind) {
    case 'date': {
      const f = new Intl.DateTimeFormat(locale, options);
      return (value: Date | number) => f.format(value);
    }
    case 'number':
    case 'currency':
    case 'percent': {
      const f = new Intl.NumberFormat(locale, options);
      return (value: number | bigint) => f.format(value);
    }
    case 'relative-time': {
      const { unit, ...rest } = options as unknown as Intl.RelativeTimeFormatOptions & { unit: Intl.RelativeTimeFormatUnit };
      const f = new Intl.RelativeTimeFormat(locale, rest);
      return (value: number) => f.format(value, unit);
    }
    case 'list': {
      const f = new Intl.ListFormat(locale, options);
      return (value: readonly string[]) => f.format(value);
    }
  }
}
