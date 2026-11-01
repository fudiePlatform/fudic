import { preset, type Pipe } from '../pipe.js';

/** The unit travels inside the options: a preset is one object, and `Intl` ignores the key. */
export function relativeTime(
  unit: Intl.RelativeTimeFormatUnit,
  options: Intl.RelativeTimeFormatOptions = {},
): Pipe<number> {
  return preset<number>('relative-time', { ...options, unit }, (locale, opts) => {
    const { unit: u, ...rest } = opts as unknown as Intl.RelativeTimeFormatOptions & { unit: Intl.RelativeTimeFormatUnit };
    const f = new Intl.RelativeTimeFormat(locale, rest);
    return (value) => f.format(value, u);
  });
}
