/**
 * Pipes (SDD-71 §3.4): what `@(x | p)` formats `x` with.
 *
 * A pipe is still DATA for every backend that is not TypeScript: `kind` and `options` are all
 * one in another language needs to format the same value with its own ICU. `format` is the one
 * thing only this runtime reads, and it is what lets the compiler emit `p.format(x, "en")` — a
 * plain call, the same for a preset and for a project's own pipe, that imports nothing.
 *
 * Each preset lives in its own module under `pipes/` and reaches only its own `Intl` formatter,
 * so a page that formats dates downloads `DateTimeFormat` and nothing else.
 */

/** A pipe: formats a `T` as text for a locale. The view calls `format` with the page's locale. */
export interface Pipe<in T> {
  /** `'pipe'` for one the project declares; otherwise the Intl formatter it presets. */
  readonly kind: 'date' | 'number' | 'currency' | 'percent' | 'relative-time' | 'list' | 'pipe';
  /** The `.fudapi` name of a project's pipe. Absent in a preset. */
  readonly name?: string;
  /** A preset's options, or a project pipe's arguments. Plain data. */
  readonly options: Readonly<Record<string, unknown>>;
  format(value: T, locale: string): string;
}

/**
 * A preset over one `Intl` formatter. Building the formatter is the expensive part, so there is
 * one per locale, kept inside the preset: it lives as long as the preset does, and is nobody
 * else's state.
 */
export function preset<T>(
  kind: Exclude<Pipe<T>['kind'], 'pipe'>,
  options: object,
  formatter: (locale: string, options: Readonly<Record<string, unknown>>) => (value: T) => string,
): Pipe<T> {
  const frozen = Object.freeze({ ...options }) as Readonly<Record<string, unknown>>;
  const byLocale = new Map<string, (value: T) => string>();
  return Object.freeze({
    kind,
    options: frozen,
    format(value: T, locale: string): string {
      let f = byLocale.get(locale);
      if (f === undefined) {
        f = formatter(locale, frozen);
        byLocale.set(locale, f);
      }
      return f(value);
    },
  });
}
