/**
 * The headers of an app (SDD-84 §3.7): what `page.headers`, `sw.headers` and `assets.headers`
 * say, as the manifest carries them to the server, to the Service Worker and to a backend in any
 * language.
 *
 * There is no policy of fudic's here. What the files say is what goes out; the one thing a
 * responder adds is the value of each placeholder (`{nonce}`), new for each response. Filling it
 * is replacing a fixed text with another: one line in any language (§4.4).
 */

export interface ManifestHeaders {
  /** Name → value, `{nonce}` still in it. */
  readonly page: Readonly<Record<string, string>>;
  readonly sw: Readonly<Record<string, string>>;
  /** Most specific first; `''` = not sent. */
  readonly assets: readonly AssetHeaders[];
}

/** One block of `assets.headers`: its path pattern (without `base`) and its headers. */
export interface AssetHeaders {
  readonly pattern: string;
  readonly headers: Readonly<Record<string, string>>;
}

/** The placeholders of a header value, by name; today only `nonce`. */
export const PLACEHOLDERS: readonly string[] = ['nonce'];

/** The values of the placeholders of one response. */
export interface PlaceholderValues {
  readonly nonce?: string;
}

/**
 * Every `{name}` of `value` with a value in `values`, filled. The function of the backends'
 * contract (§4.4): a fixed text replaced by another.
 */
export function fillPlaceholders(value: string, values: PlaceholderValues): string {
  let out = value;
  for (const name of PLACEHOLDERS) {
    const filling = values[name as keyof PlaceholderValues];
    if (filling !== undefined) out = out.split(`{${name}}`).join(filling);
  }
  return out;
}

/** Whether the page headers ask for a nonce: some value holds `{nonce}`. */
export function wantsNonce(headers: ManifestHeaders): boolean {
  return Object.values(headers.page).some((value) => value.includes('{nonce}'));
}

/** The page headers of one response, every `{name}` filled from `values`. */
export function pageHeadersFor(headers: ManifestHeaders, values: PlaceholderValues): Headers {
  const out = new Headers();
  for (const [name, value] of Object.entries(headers.page)) out.set(name, fillPlaceholders(value, values));
  return out;
}

/** `/assets/**` matches `/assets/a/b.png`; `*` does not cross a `/`. The pattern of `sw.json`. */
export function globMatches(pattern: string, pathname: string): boolean {
  const source = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/gu, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');
  return new RegExp(`^${source}$`, 'u').test(pathname);
}

/** How specific a pattern is: a path without wildcards beats any pattern; then, its literal characters. */
function specificity(pattern: string): number {
  const literal = pattern.replace(/\*/gu, '').length;
  return pattern.includes('*') ? literal : Number.MAX_SAFE_INTEGER;
}

/** The rules of `assets.headers`, most specific first; a tie keeps the order of the file. */
export function orderAssetRules<R extends { readonly pattern: string }>(rules: readonly R[]): readonly R[] {
  return [...rules].sort((a, b) => specificity(b.pattern) - specificity(a.pattern));
}

/**
 * What `assets` decides for `path` (without `base`): for each name, the value of the most specific
 * rule that matches, `''` included — a header that must NOT go out, even if the host's static
 * server would write its own.
 */
export function assetDecisionsFor(headers: ManifestHeaders, path: string): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  const decided = new Set<string>();
  for (const rule of headers.assets) {
    if (!globMatches(rule.pattern, path)) continue;
    for (const [name, value] of Object.entries(rule.headers)) {
      const key = name.toLowerCase();
      if (decided.has(key)) continue;
      decided.add(key);
      out[name] = value;
    }
  }
  return out;
}

/** What `assets` says for `path` (without `base`): the winner per name, the empty ones dropped. */
export function assetHeadersFor(headers: ManifestHeaders, path: string): Readonly<Record<string, string>> {
  return Object.fromEntries(Object.entries(assetDecisionsFor(headers, path)).filter(([, value]) => value !== ''));
}
