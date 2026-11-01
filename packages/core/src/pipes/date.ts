import { preset, type Pipe } from '../pipe.js';

/**
 * `timeZone` is required: a date formatted without one differs between server and browser —
 * FUD0912 carried into the preset, and enforced by its type.
 */
export function date(options: Intl.DateTimeFormatOptions & { timeZone: string }): Pipe<Date | number> {
  return preset<Date | number>('date', options, (locale, opts) => {
    const f = new Intl.DateTimeFormat(locale, opts);
    return (value) => f.format(value);
  });
}
