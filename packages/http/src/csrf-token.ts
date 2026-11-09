/**
 * The CSRF token of `use csrf` with `token true` (SDD-81 §3.13): a signed double submit.
 *
 * The cookie holds 32 random bytes, `HttpOnly`: the page's script never sees it. The token is
 * `HMAC-SHA256(secret, cookie)`, which the page asks for at `GET {base}_fudic/csrf` and sends
 * back in the header. A page of another site can neither read the token (no CORS) nor forge it
 * (no secret), and the server keeps nothing: the cookie and the secret are enough to check it.
 *
 * Server only: the browser build never imports this module.
 */

import { CSRF_PATH } from '@fudic/conventions';
import { serializeCookie } from './cookies.js';
import { forbidden, HttpError } from './errors.js';
import { parseCookies } from './server/context.js';
import { serverSettings, type ServerSettings } from './server/settings.js';

/** The cookie's name: with the `__Host-` prefix where the cookie can be `Secure`. */
export const csrfCookieName = (settings: ServerSettings): string => (settings.secureCookies ? '__Host-fudic-csrf' : 'fudic-csrf');

/** 32 bytes in base64url, unpadded. */
const COOKIE_VALUE = /^[A-Za-z0-9_-]{43}$/u;

const toBase64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');

function fromBase64url(text: string): Uint8Array<ArrayBuffer> | undefined {
  // 32 bytes of HMAC-SHA256 are 43 characters: anything else is not a token, and `atob` would
  // throw on a length no base64 has.
  if (!/^[A-Za-z0-9_-]{43}$/u.test(text)) return undefined;
  const binary = atob(text.replace(/-/gu, '+').replace(/_/gu, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** The 500 of a token mode with nothing to sign with: a mistake of the deployment, said plainly. */
export const noSecret = (): HttpError =>
  new HttpError({ status: 500, title: 'Internal Server Error', detail: 'csrf token mode needs a secret (FUDIC_SECRET)' });

const keyOf = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

/** The token of `cookie`. */
export async function csrfToken(secret: string, cookie: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await keyOf(secret), new TextEncoder().encode(cookie));
  return toBase64url(new Uint8Array(signature));
}

/** Whether `token` is the token of `cookie`. In constant time: `crypto.subtle.verify`. */
export async function verifyCsrfToken(secret: string, cookie: string, token: string): Promise<boolean> {
  const signature = fromBase64url(token);
  if (signature === undefined) return false;
  return crypto.subtle.verify('HMAC', await keyOf(secret), signature, new TextEncoder().encode(cookie));
}

/**
 * `GET {base}_fudic/csrf`: the token of the cookie the browser has, the cookie made first when it
 * has none. Only to a page of this origin: whatever the browser says of another, `403`.
 */
export async function csrfEndpoint(request: Request, settings: ServerSettings): Promise<Response> {
  if (request.method !== 'GET') throw new HttpError({ status: 405, title: 'Method Not Allowed' });
  const site = request.headers.get('sec-fetch-site');
  if (site !== null && site !== 'same-origin') throw forbidden('cross-site request');
  if (settings.secret === undefined) throw noSecret();
  const name = csrfCookieName(settings);
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Cookie' });
  let cookie = parseCookies(request.headers.get('cookie')).get(name);
  if (cookie === undefined || !COOKIE_VALUE.test(cookie)) {
    cookie = toBase64url(crypto.getRandomValues(new Uint8Array(32)));
    headers.append(
      'set-cookie',
      serializeCookie(name, cookie, { sameSite: 'strict', secureByDefault: settings.secureCookies }),
    );
  }
  return new Response(JSON.stringify({ token: await csrfToken(settings.secret, cookie) }), { status: 200, headers });
}

/** Whether `pathname` is the token's URL under `root` (the app's `base` without its last `/`). */
export const isCsrfPath = (pathname: string, root: string): boolean => pathname === `${root}${CSRF_PATH}`;

/** The token the header carries is the one of the cookie the request carries. */
export async function checkCsrfToken(
  ctx: { readonly cookies: ReadonlyMap<string, string>; readonly response: object },
  header: string,
): Promise<'ok' | 'bad'> {
  const settings = serverSettings(ctx.response);
  if (settings.secret === undefined) throw noSecret();
  const cookie = ctx.cookies.get(csrfCookieName(settings));
  if (cookie === undefined || !COOKIE_VALUE.test(cookie)) return 'bad';
  return (await verifyCsrfToken(settings.secret, cookie, header)) ? 'ok' : 'bad';
}
