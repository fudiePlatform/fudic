/** The URL of a call, in the browser: the page's params and the app's `base` (SDD-60 §3.11). */

/** The params of `pattern` read off the page the browser is on; none when it is not one. */
export function pageParams(
  pattern: string | undefined,
  base: string,
  pathname: string,
): Record<string, string> {
  if (pattern === undefined) return {};
  const want = join(base, pattern).split('/');
  const have = pathname.split('/');
  const params: Record<string, string> = {};
  if (want.length !== have.length) return params;
  want.forEach((seg, i) => {
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(have[i]!);
  });
  return params;
}

/** `base` + path, without the double slash a trailing `base` leaves. */
export function join(base: string, path: string): string {
  return `${base}${path}`.replace(/\/{2,}/gu, '/');
}
