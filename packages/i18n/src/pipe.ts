/**
 * Pipes: formatter presets over `Intl`, as DATA (SDD-58 §4.4, decision 158).
 *
 * A preset carries a `kind` and its `options` and no function: the locale is the one thing it
 * lacks, and the compiler adds it as a literal of each language's module graph. Being data is
 * what lets a backend in another language format the same value with its own ICU without
 * running JavaScript (IDEA-03 §4).
 *
 * The catalogue is closed — the six `Intl` formatters below. A pipe of one's own is a preset
 * with options: `const long = date({ dateStyle: 'long', timeZone: 'Europe/Madrid' })`.
 */

/** A pipe: a formatter preset over Intl. Pure data; the locale is added by the compiler. */
export interface Pipe<in T> {
  readonly kind: 'date' | 'number' | 'currency' | 'percent' | 'relative-time' | 'list';
  readonly options: Readonly<Record<string, unknown>>;
  /** Phantom: the type of the value this pipe accepts. Never present at runtime. */
  readonly __in?: (value: T) => void;
}

function preset<T>(kind: Pipe<T>['kind'], options: object): Pipe<T> {
  return Object.freeze({ kind, options: Object.freeze({ ...options }) as Readonly<Record<string, unknown>> });
}

/**
 * `timeZone` is required: a date formatted without one differs between server and browser —
 * FUD0912 carried into the preset, and enforced by its type.
 */
export function date(options: Intl.DateTimeFormatOptions & { timeZone: string }): Pipe<Date | number> {
  return preset('date', options);
}

export function number(options: Intl.NumberFormatOptions = {}): Pipe<number | bigint> {
  return preset('number', options);
}

export function currency(
  code: string,
  options: Omit<Intl.NumberFormatOptions, 'style' | 'currency'> = {},
): Pipe<number | bigint> {
  return preset('currency', { ...options, style: 'currency', currency: code });
}

export function percent(options: Omit<Intl.NumberFormatOptions, 'style'> = {}): Pipe<number> {
  return preset('percent', { ...options, style: 'percent' });
}

/** The unit travels inside the options: a preset is one object, and `Intl` ignores the key. */
export function relativeTime(
  unit: Intl.RelativeTimeFormatUnit,
  options: Intl.RelativeTimeFormatOptions = {},
): Pipe<number> {
  return preset('relative-time', { ...options, unit });
}

export function list(options: Intl.ListFormatOptions = {}): Pipe<readonly string[]> {
  return preset('list', options);
}
