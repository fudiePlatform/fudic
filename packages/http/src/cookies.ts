/**
 * Setting and removing a cookie from a server function or a `load` (SDD-69 §3.1, §4.1), with
 * the safe options already on: `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` as the server
 * says (SDD-81 §3.11).
 *
 * Whether a cookie is `Secure` by default is declared by whoever mounts the server
 * (`secureCookies`), never guessed from the request: a `Host` of `localhost` behind a proxy is
 * production, and an address of the local network in dev is not. Whatever the default, a name
 * with the `__Host-` or `__Secure-` prefix goes out `Secure`, because the browser drops it
 * otherwise — and browsers take `Secure` on `http://localhost`.
 *
 * Only what a browser would drop without a word throws: a name that is not an HTTP token,
 * `SameSite=None` or `Partitioned` without `Secure`, and a `__Host-` cookie with a `Domain` or
 * another `Path`. Everything else is the developer's call.
 */

import { serverSettings } from './server/settings.js';
import type { ServerContext } from './types.js';

export interface CookieOptions {
  /** Seconds. Absent: the cookie lasts until the browser closes. */
  readonly maxAge?: number;
  readonly expires?: Date;
  /** Default: '/'. */
  readonly path?: string;
  /** Absent: this host only. */
  readonly domain?: string;
  /** Default: 'lax'. */
  readonly sameSite?: 'strict' | 'lax' | 'none';
  /** Default: what the server says (`secureCookies`, true unless it said otherwise). */
  readonly secure?: boolean;
  /** Default: true. */
  readonly httpOnly?: boolean;
  /** Default: false. */
  readonly partitioned?: boolean;
}

/** An HTTP token (RFC 9110 §5.6.2): what a cookie name may be. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

const SAME_SITE = { strict: 'Strict', lax: 'Lax', none: 'None' } as const;

function checkName(name: string): void {
  if (!TOKEN.test(name)) throw new TypeError(`cookie name ${JSON.stringify(name)} is not an HTTP token`);
}

/** The prefixes a browser holds to `Secure` (RFC 6265bis §4.1.3). */
const prefixed = (name: string): boolean => name.startsWith('__Host-') || name.startsWith('__Secure-');

/** Whether the cookie `name` goes out `Secure`: its prefix, then its options, then the server. */
const isSecure = (name: string, secure: boolean | undefined, byDefault: boolean): boolean =>
  prefixed(name) || (secure ?? byDefault);

/** The `Set-Cookie` text of a cookie, without touching any context. */
export function serializeCookie(
  name: string,
  value: string,
  options: CookieOptions & {
    /** What `Secure` is when `options.secure` does not say: the server's `secureCookies`. */
    readonly secureByDefault: boolean;
  },
): string {
  checkName(name);
  const secure = isSecure(name, options.secure, options.secureByDefault);
  const sameSite = options.sameSite ?? 'lax';
  if (sameSite === 'none' && !secure) throw new TypeError(`cookie ${name}: SameSite=None needs Secure`);
  if (options.partitioned === true && !secure) throw new TypeError(`cookie ${name}: Partitioned needs Secure`);
  if (name.startsWith('__Host-') && (options.domain !== undefined || (options.path ?? '/') !== '/')) {
    throw new TypeError(`cookie ${name}: a __Host- cookie has no Domain and its Path is /`);
  }
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires !== undefined) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options.domain !== undefined) parts.push(`Domain=${options.domain}`);
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.httpOnly ?? true) parts.push('HttpOnly');
  if (secure) parts.push('Secure');
  parts.push(`SameSite=${SAME_SITE[sameSite]}`);
  if (options.partitioned === true) parts.push('Partitioned');
  return parts.join('; ');
}

/** Appends a `Set-Cookie` to `ctx.response`. Throws a TypeError on a name or option the browser would reject. */
export function setCookie(ctx: ServerContext, name: string, value: string, options: CookieOptions = {}): void {
  const secureByDefault = serverSettings(ctx.response).secureCookies;
  ctx.response.headers.append('set-cookie', serializeCookie(name, value, { ...options, secureByDefault }));
}

/**
 * Expires `name` in the browser: same name, path and domain, `Max-Age=0`, and `Secure` when the
 * cookie would carry it — without it, the browser does not touch a `__Host-` or `__Secure-` one.
 */
export function deleteCookie(
  ctx: ServerContext,
  name: string,
  options: Pick<CookieOptions, 'path' | 'domain' | 'secure'> = {},
): void {
  checkName(name);
  const parts = [`${name}=`, `Path=${options.path ?? '/'}`];
  if (options.domain !== undefined) parts.push(`Domain=${options.domain}`);
  parts.push('Max-Age=0');
  if (isSecure(name, options.secure, serverSettings(ctx.response).secureCookies)) parts.push('Secure');
  ctx.response.headers.append('set-cookie', parts.join('; '));
}
