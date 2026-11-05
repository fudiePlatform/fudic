/**
 * The door of the preview (SDD-78 §4.3): over HTTP the app goes out by the MCP's port and tunnel,
 * and nothing of it answers without the preview's cookie. The cookie is given by opening
 * `/_fudic/preview/<secret>`, and its value is derived from the secret: a new secret closes every
 * door it opened. The app never sees it: it is taken off the request before Vite gets it.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const PREVIEW_COOKIE = 'fudic-preview';

/** The path that opens the door. */
export function previewPath(secret: string): string {
  return `/_fudic/preview/${secret}`;
}

/** The cookie's value: never the secret, which also opens the MCP. */
export function cookieValue(secret: string): string {
  return createHmac('sha256', secret).update(PREVIEW_COOKIE).digest('hex');
}

/** The cookies of a `Cookie` header, by name. */
function cookiesOf(header: string | undefined): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const pair of (header ?? '').split(';')) {
    const at = pair.indexOf('=');
    if (at > 0) out.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
  return out;
}

/** Whether the request carries the door's cookie for `secret`. */
export function hasCookie(req: IncomingMessage, secret: string): boolean {
  const got = Buffer.from(cookiesOf(req.headers.cookie).get(PREVIEW_COOKIE) ?? '');
  const want = Buffer.from(cookieValue(secret));
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The request's `Cookie` without the door's: what the app is handed. */
export function withoutCookie(req: IncomingMessage): void {
  const rest = [...cookiesOf(req.headers.cookie)].filter(([name]) => name !== PREVIEW_COOKIE);
  if (rest.length === 0) delete req.headers.cookie;
  else req.headers.cookie = rest.map(([name, value]) => `${name}=${value}`).join('; ');
}

/** Where the door sends to: a path of this site, `/` when it is anything else. */
export function destinationOf(to: string | null): string {
  return to !== null && to.startsWith('/') && !to.startsWith('//') && !to.includes('\\') ? to : '/';
}

/** Whether the request came over https: the tunnel says so in its header. */
export function isSecure(req: IncomingMessage): boolean {
  return req.headers['x-forwarded-proto'] === 'https';
}

/** The `Set-Cookie` of the door: for the whole site, out of scripts' reach, no expiry. */
export function setCookie(secret: string, secure: boolean): string {
  return `${PREVIEW_COOKIE}=${cookieValue(secret)}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
