/**
 * The URL guard (SDD-51 §3.7, decision 140): what an attribute that navigates or loads may be
 * written with when its value is not known at build time.
 *
 * Defence in depth. The default Content-Security-Policy already refuses `javascript:`; this is
 * for the HTML served without it. The compiler wraps only the values whose fixed prefix does not
 * pin the origin (`href="@url"`, `` href=@(`/${x}`) ``); `href="/posts/@id"` never comes here.
 *
 * ONE pure function, and every adapter calls it — the server's, the service worker's and the
 * browser's. The server paints the attribute and the browser adopts it, so the two must write
 * the same string to the byte, or the hydration would find a tree it does not recognise.
 *
 * Allow-list, never deny-list: a scheme not named below is replaced, so `vbscript:` and whatever
 * a browser invents tomorrow are refused without anybody having to think of them.
 */

/** What an unsafe URL is written as: a document that is empty and runs nothing. */
export const INERT_URL = 'about:blank';

/** The schemes a view may produce for any URL attribute. */
const SAFE_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * The mark of a trusted URL. From the global symbol registry, and not a private field, because
 * the guard and the `trustedUrl` an author imports may come from two copies of this module — a
 * published runtime piece and the application bundle — and a mark only one copy recognised
 * would make a trusted URL inert in exactly one of the two. Data cannot carry it: JSON has no
 * symbols, so nothing a server or a request hands over is ever marked.
 */
const TRUSTED: unique symbol = Symbol.for('fudic.trustedUrl');

/**
 * A URL the author vouches for (decision 140): `trustedUrl('miapp:abrir')`.
 *
 * The exception is a mark on the VALUE and not on the type, because the compiler has no types:
 * a `TrustedURL` annotation would be invisible to the emit. The guard recognises the mark at
 * runtime and writes the URL as it is. The author calls it in `@code`, where a review sees it.
 */
export interface TrustedURL {
  readonly [TRUSTED]: string;
  /**
   * The URL again, under a plain name: what the template's types recognise a trusted URL by,
   * since the projection cannot name this module's symbol. The guard never reads it — a plain
   * object with this property is not marked, only typed alike.
   */
  readonly fudicTrustedUrl: string;
  toString(): string;
}

/** Mark a URL as trusted: the guard writes it untouched, whatever its scheme. */
export function trustedUrl(url: string): TrustedURL {
  return Object.freeze({ [TRUSTED]: url, fudicTrustedUrl: url, toString: () => url });
}

/** Whether `value` was made by `trustedUrl`. */
export function isTrustedUrl(value: unknown): value is TrustedURL {
  return typeof value === 'object' && value !== null && typeof (value as TrustedURL)[TRUSTED] === 'string';
}

/**
 * The value a URL attribute is written with: the value itself when it is safe, `INERT_URL` when
 * it is not. Pure, and therefore the same on every side.
 *
 * `tag` and `name` matter for two things: a list attribute (`srcset`, `imagesrcset`, `ping`)
 * is judged URL by URL, and `data:image/…` is an image only where an image is loaded — an
 * `<img src>` and a `srcset`.
 */
export function safeUrl(tag: string, name: string, value: unknown): string {
  if (isTrustedUrl(value)) return value[TRUSTED];
  const text = String(value);
  const attribute = name.toLowerCase();
  // A list: every URL in it has to pass, or none is written.
  const urls = attribute === 'ping' ? tokens(text) : IMAGE_LISTS.has(attribute) ? candidateUrls(text) : [text];
  return urls.every((url) => isSafe(tag, attribute, url)) ? text : INERT_URL;
}

/** The attributes that are a `srcset`-style list of image candidates. */
const IMAGE_LISTS: ReadonlySet<string> = new Set(['srcset', 'imagesrcset']);

/** The URLs of a `ping`: separated by whitespace. */
function tokens(text: string): readonly string[] {
  return text.split(/\s+/u).filter((url) => url !== '');
}

/**
 * The URLs of a `srcset`, as the HTML parser reads it: a candidate is a URL — a run with no
 * whitespace, which may hold commas, as a `data:` URL does — then descriptors up to the next
 * comma. Splitting on every comma would cut `data:image/png;base64,…` in two and refuse an
 * image that is perfectly fine.
 */
function candidateUrls(text: string): readonly string[] {
  const urls: string[] = [];
  let i = 0;
  for (;;) {
    while (i < text.length && /[\s,]/u.test(text[i]!)) i++;
    const start = i;
    while (i < text.length && !/\s/u.test(text[i]!)) i++;
    if (i === start) return urls;
    const url = text.slice(start, i);
    urls.push(url.replace(/,+$/u, ''));
    if (url.endsWith(',')) continue;
    // The descriptors: everything up to the comma that ends the candidate.
    while (i < text.length && text[i] !== ',') i++;
  }
}

function isSafe(tag: string, name: string, url: string): boolean {
  // What a browser ignores before it reads a scheme: tabs and line breaks anywhere, and control
  // characters and spaces in front. `java\tscript:` and `  javascript:` are both `javascript:`.
  // `\x00` and not the `\u` form: the source travels in the maps, which must hold no NUL escape.
  const normalized = url.replace(/[\t\n\r]/gu, '').replace(/^[\x00-\x20]+/u, '');
  // Two slashes, either way round, are another ORIGIN: a browser reads `//evil.example`,
  // `/\evil.example` and `\\evil.example` as a host, with the page's own scheme.
  if (/^[/\\]{2}/u.test(normalized)) return false;
  const scheme = schemeOf(normalized);
  if (scheme === undefined) return true;
  if (SAFE_SCHEMES.has(scheme)) return true;
  const image = (tag.toLowerCase() === 'img' && name === 'src') || IMAGE_LISTS.has(name);
  return scheme === 'data:' && image && normalized.slice(scheme.length).toLowerCase().startsWith('image/');
}

/**
 * The scheme, lower case and with its `:`, or `undefined` for a URL that has none — no `:`
 * before the first `/`, `?` or `#`, which makes it relative to the page.
 */
function schemeOf(url: string): string | undefined {
  const end = url.search(/[:/?#]/u);
  if (end === -1 || url[end] !== ':') return undefined;
  return url.slice(0, end + 1).toLowerCase();
}

/**
 * `import.meta.env.DEV`, which Vite replaces in a build, so the warning is pruned with it. Read
 * at the call and not once at load, so a test can switch it.
 */
function dev(): boolean {
  const meta = import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean } };
  // A runtime that loads this module without Vite has no `import.meta.env` at all: the server
  // of a published app, reading `@fudic/ssr` from `node_modules`. The test runner is Vite, so
  // there it always has one.
  /* v8 ignore next */
  return meta.env?.DEV === true;
}

/**
 * `safeUrl`, telling the developer when it replaced a value. The warning is the only thing this
 * adds, and it never changes what is written: the server and the browser still agree.
 */
export function guardUrl(tag: string, name: string, value: unknown): string {
  const written = safeUrl(tag, name, value);
  if (dev() && written === INERT_URL && String(value) !== INERT_URL) {
    console.warn(
      `fudic: the URL ${JSON.stringify(String(value))} of <${tag} ${name}> was replaced with ${INERT_URL}: ` +
        'its scheme is not one a view may produce. Wrap it in trustedUrl() in @code if it is meant.',
    );
  }
  return written;
}
