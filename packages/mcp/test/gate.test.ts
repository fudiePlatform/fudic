/**
 * The door of the preview (SDD-78 §4.3, criterion 9): the cookie a secret opens, what it lets in,
 * where it sends, and the URLs and the call target of each entry.
 */

import { createHmac } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';
import { cookieValue, destinationOf, hasCookie, isSecure, PREVIEW_COOKIE, previewPath, setCookie, withoutCookie } from '../src/gate.js';
import { HttpSite, stdioSite } from '../src/site.js';

const SECRET = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

const req = (headers: IncomingMessage['headers']): IncomingMessage => ({ headers: { ...headers } }) as IncomingMessage;

describe('the cookie', () => {
  it('is called fudic-preview, opened at /_fudic/preview/<secret>', () => {
    expect(PREVIEW_COOKIE).toBe('fudic-preview');
    expect(previewPath(SECRET)).toBe(`/_fudic/preview/${SECRET}`);
  });

  it('its value is derived from the secret, never the secret itself; another secret, another value', () => {
    expect(cookieValue(SECRET)).toBe(createHmac('sha256', SECRET).update('fudic-preview').digest('hex'));
    expect(cookieValue(SECRET)).not.toContain(SECRET);
    expect(cookieValue(OTHER)).not.toBe(cookieValue(SECRET));
  });

  it('is set for the whole site, HttpOnly, SameSite=Lax, with no expiry; Secure only over https', () => {
    expect(setCookie(SECRET, false)).toBe(`fudic-preview=${cookieValue(SECRET)}; Path=/; HttpOnly; SameSite=Lax`);
    expect(setCookie(SECRET, true)).toBe(`fudic-preview=${cookieValue(SECRET)}; Path=/; HttpOnly; SameSite=Lax; Secure`);
    expect(setCookie(SECRET, true)).not.toMatch(/Expires|Max-Age/u);
  });

  it('a request came over https when the tunnel says so', () => {
    expect(isSecure(req({ 'x-forwarded-proto': 'https' }))).toBe(true);
    expect(isSecure(req({ 'x-forwarded-proto': 'http' }))).toBe(false);
    expect(isSecure(req({}))).toBe(false);
  });
});

describe('hasCookie', () => {
  it('only with the value of this secret, among other cookies', () => {
    expect(hasCookie(req({ cookie: `a=1; fudic-preview=${cookieValue(SECRET)}; b=2` }), SECRET)).toBe(true);
    expect(hasCookie(req({ cookie: `fudic-preview=${cookieValue(OTHER)}` }), SECRET)).toBe(false);
    expect(hasCookie(req({ cookie: 'fudic-preview=short' }), SECRET)).toBe(false);
    expect(hasCookie(req({ cookie: `fudic-preview=${SECRET}` }), SECRET)).toBe(false);
    expect(hasCookie(req({ cookie: 'a=1; =x; broken' }), SECRET)).toBe(false);
    expect(hasCookie(req({}), SECRET)).toBe(false);
  });
});

describe('withoutCookie', () => {
  it('takes the door\'s cookie off and keeps the app\'s', () => {
    const r = req({ cookie: `session=abc; fudic-preview=${cookieValue(SECRET)}; theme=dark` });
    withoutCookie(r);
    expect(r.headers.cookie).toBe('session=abc; theme=dark');
  });

  it('with only the door\'s, no Cookie header is left', () => {
    const r = req({ cookie: `fudic-preview=${cookieValue(SECRET)}` });
    withoutCookie(r);
    expect(r.headers).not.toHaveProperty('cookie');
    const none = req({});
    withoutCookie(none);
    expect(none.headers).not.toHaveProperty('cookie');
  });
});

describe('destinationOf', () => {
  it('a path of this site, kept as it is', () => {
    expect(destinationOf('/productos')).toBe('/productos');
    expect(destinationOf('/productos/1?x=2#y')).toBe('/productos/1?x=2#y');
  });

  it('anything else is /: nothing, another site, a scheme, a backslash', () => {
    for (const to of [null, '', 'productos', '//evil.example', 'https://evil.example', '/\\evil.example', 'javascript:alert(1)']) {
      expect(destinationOf(to), String(to)).toBe('/');
    }
  });
});

describe('the site', () => {
  it('over HTTP: the door on the MCP port, and the public one once the tunnel is up', () => {
    const site = new HttpSite('/project', SECRET, 4317);
    expect(site.urls('/productos/1')).toEqual({ local: `http://127.0.0.1:4317/_fudic/preview/${SECRET}?to=/productos/1` });
    site.publicOrigin = 'https://brave-otter-12.trycloudflare.com';
    expect(site.urls('/productos')).toEqual({
      local: `http://127.0.0.1:4317/_fudic/preview/${SECRET}?to=/productos`,
      public: `https://brave-otter-12.trycloudflare.com/_fudic/preview/${SECRET}?to=/productos`,
    });
    // The slashes stay readable; the rest is escaped.
    expect(site.urls('/buscar?q=a b&c=d').local).toBe(`http://127.0.0.1:4317/_fudic/preview/${SECRET}?to=/buscar%3Fq%3Da%20b%26c%3Dd`);
    expect(site.dev.state).toBe('idle');
  });

  it('over HTTP, a call goes to the MCP port with the door\'s cookie', () => {
    expect(new HttpSite('/project', SECRET, 4317).callTarget()).toEqual({
      origin: 'http://127.0.0.1:4317',
      headers: { cookie: `fudic-preview=${cookieValue(SECRET)}` },
    });
  });

  it('over stdio: the dev server\'s own address, with no door', () => {
    const site = stdioSite('/project', 4400);
    Object.defineProperty(site.dev, 'local', { value: 'http://127.0.0.1:4401' });
    expect(site.urls('/productos')).toEqual({ local: 'http://127.0.0.1:4401/productos' });
    expect(site.callTarget()).toEqual({ origin: 'http://127.0.0.1:4401' });
  });
});
