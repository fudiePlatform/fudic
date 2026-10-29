/**
 * Setting and removing a cookie from a server function or a `load` (SDD-69 §3.1, §4.1), with
 * the safe options already on: `HttpOnly`, `SameSite=Lax`, `Path=/` and `Secure` except on a
 * loopback host, where the dev server and `vite preview` speak `http`.
 *
 * Only what a browser would drop without a word throws: a name that is not an HTTP token, and
 * `SameSite=None` or `Partitioned` without `Secure`. Everything else is the developer's call.
 */

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
  /** Default: true, except when the request's host is localhost, 127.0.0.1 or [::1]. */
  readonly secure?: boolean;
  /** Default: true. */
  readonly httpOnly?: boolean;
  /** Default: false. */
  readonly partitioned?: boolean;
}

/** An HTTP token (RFC 9110 §5.6.2): what a cookie name may be. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

const SAME_SITE = { strict: 'Strict', lax: 'Lax', none: 'None' } as const;

function checkName(name: string): void {
  if (!TOKEN.test(name)) throw new TypeError(`cookie name ${JSON.stringify(name)} is not an HTTP token`);
}

/** The `Set-Cookie` text of a cookie, without touching any context. */
export function serializeCookie(name: string, value: string, options: CookieOptions & { readonly host: string }): string {
  checkName(name);
  const secure = options.secure ?? !LOOPBACK.has(options.host);
  const sameSite = options.sameSite ?? 'lax';
  if (sameSite === 'none' && !secure) throw new TypeError(`cookie ${name}: SameSite=None needs Secure`);
  if (options.partitioned === true && !secure) throw new TypeError(`cookie ${name}: Partitioned needs Secure`);
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
  ctx.response.headers.append('set-cookie', serializeCookie(name, value, { ...options, host: ctx.url.hostname }));
}

/** Expires `name` in the browser: same name, path and domain, `Max-Age=0`. */
export function deleteCookie(ctx: ServerContext, name: string, options: Pick<CookieOptions, 'path' | 'domain'> = {}): void {
  checkName(name);
  const parts = [`${name}=`, `Path=${options.path ?? '/'}`];
  if (options.domain !== undefined) parts.push(`Domain=${options.domain}`);
  parts.push('Max-Age=0');
  ctx.response.headers.append('set-cookie', parts.join('; '));
}
