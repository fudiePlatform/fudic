/**
 * The language of a URL, as the server answers it (SDD-58 §4.5): the prefix a page carries, the
 * redirect of one asked without it, and the locale its error page is painted in.
 */

/** `/about` in `en` with two or more locales: `/en/about`; `/` is `/en`. One locale: as it is. */
export function prefixPattern(pattern: string, locale: string, locales: readonly string[]): string {
  if (locales.length < 2) return pattern;
  return pattern === '/' ? `/${locale}` : `/${locale}${pattern}`;
}

/**
 * The locale a URL is in: the one its first segment names (`/en/about` → `en`) with two or more
 * locales, the only one with one, and none for an app without `locales` or a URL with no prefix.
 */
export function localeOfPath(pathname: string, locales: readonly string[] | undefined): string | undefined {
  if (locales === undefined || locales.length < 2) return locales?.[0];
  const first = pathname.split('/')[1];
  return locales.find((l) => l === first);
}

/**
 * The locale `_error.fud` is asked in at `pathname` (§4.5): its prefix's
 * (`/en/_fudic/error/404`), else that of the page the browser comes from — `errorPages` sends a
 * failed call to `/_fudic/error/404`, which has none — else none. `refererPath` is that page's
 * path, base already stripped.
 */
export function errorLocaleOf(
  pathname: string,
  refererPath: string | undefined,
  locales: readonly string[] | undefined,
): string | undefined {
  return localeOfPath(pathname, locales) ?? (refererPath === undefined ? undefined : localeOfPath(refererPath, locales));
}

/** `pathname` without the locale prefix it opens with: `/en/_fudic/error/404` → `/_fudic/error/404`. */
export function withoutLocalePrefix(pathname: string, locales: readonly string[] | undefined): string {
  const locale = locales === undefined || locales.length < 2 ? undefined : localeOfPath(pathname, locales);
  return locale === undefined ? pathname : pathname.slice(locale.length + 1) || '/';
}

/**
 * The locale of the `Accept-Language` header that best fits `locales` (§4.5): the same tag,
 * else the same base language, else the first of the list.
 */
export function negotiate(header: string | undefined, locales: readonly string[]): string {
  const wanted = (header ?? '')
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';') as [string, ...string[]];
      const q = params.map((p) => /^\s*q=([\d.]+)/u.exec(p)?.[1]).find((v) => v !== undefined);
      return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q), i };
    })
    .filter((w) => w.tag !== '' && w.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  const lower = locales.map((l) => l.toLowerCase());
  for (const w of wanted) {
    const exact = lower.indexOf(w.tag);
    if (exact !== -1) return locales[exact]!;
    const base = w.tag.split('-')[0]!;
    const same = lower.findIndex((l) => l.split('-')[0] === base);
    if (same !== -1) return locales[same]!;
  }
  return locales[0]!;
}

/**
 * Where a request with no locale prefix is sent (§4.5), relative to `base`: `/` and every page
 * of the app asked without its prefix go to the same page in the language that fits
 * `Accept-Language`. That URL is the page's `x-default`. `false` for everything else — a URL
 * with a prefix decides by itself, and a file or the framework's own URLs are not pages.
 */
export function localeRedirect(
  pathname: string,
  acceptLanguage: string | undefined,
  locales: readonly string[] | undefined,
  isPage: (pathname: string) => boolean,
): string | false {
  if (locales === undefined || locales.length < 2 || localeOfPath(pathname, locales) !== undefined) return false;
  if (pathname !== '/') {
    if (pathname.startsWith('/_fudic/') || pathname.startsWith('/@') || /\.[^/]*$/u.test(pathname)) return false;
    if (!isPage(`/${locales[0]!}${pathname}`)) return false;
  }
  return `${negotiate(acceptLanguage, locales)}${pathname}`;
}
