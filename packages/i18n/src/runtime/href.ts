/**
 * `$href` — the language prefix of a link (SDD-58 §4.8).
 *
 * With two or more languages, `<a href="/about">` on an `/en/…` page goes to `/en/about`. The
 * compiler applies the rule to a static `href` while it compiles, by calling this same
 * function, and wraps a dynamic one in a call to it — so both follow one rule, written once.
 *
 * Left as they are:
 * - what does not start with `/`, or starts with `//` (another origin);
 * - what already starts with a configured language: that is how a language switcher is written;
 * - what starts with `/_fudic/`: the framework's own URLs;
 * - what has a file extension in its last segment (`/doc.pdf`).
 */

import { RUNTIME_DIR } from '@fudic/conventions';

/** `value` with the prefix of `locale` when the rule asks for one; anything else untouched. */
export function $href<T>(value: T, locale: string, locales: readonly string[]): T {
  if (typeof value !== 'string' || !localizable(value, locales)) return value;
  // `/` becomes `/en/`, and `/about?x#y` becomes `/en/about?x#y`.
  return `/${locale}${value}` as T;
}

function localizable(href: string, locales: readonly string[]): boolean {
  if (!href.startsWith('/') || href.startsWith('//') || href.startsWith(`/${RUNTIME_DIR}/`)) return false;
  const path = href.replace(/[?#].*$/su, '');
  const first = path.split('/')[1]!;
  if (locales.includes(first)) return false;
  const last = path.slice(path.lastIndexOf('/') + 1);
  return !last.includes('.');
}
