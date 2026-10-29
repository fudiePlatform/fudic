/**
 * SDD-69 §3.1, §4.1 and criteria 1–6: setting and removing a cookie, with the safe options on
 * by default, and the `TypeError` of what a browser would drop without a word.
 */

import { describe, expect, it } from 'vitest';
import { deleteCookie, serializeCookie, setCookie } from '../src/index.js';
import { serverContext } from '../src/server/context.js';

const ctxAt = (url: string) => serverContext({ method: 'POST', name: 'login', url: new URL(url), params: {}, args: undefined });

const cookiesOf = (ctx: ReturnType<typeof ctxAt>) => ctx.response.headers.getSetCookie();

describe('setCookie', () => {
  it('criterion 1: the defaults, Secure on a public host', () => {
    const ctx = ctxAt('https://app.dev/');
    setCookie(ctx, 'sid', 'a b');
    expect(cookiesOf(ctx)).toEqual(['sid=a%20b; Path=/; HttpOnly; Secure; SameSite=Lax']);
  });

  it('criterion 1: without Secure on a loopback host', () => {
    for (const url of ['http://localhost:5173/', 'http://127.0.0.1:4173/', 'http://[::1]:5173/']) {
      const ctx = ctxAt(url);
      setCookie(ctx, 'sid', 'a b');
      expect(cookiesOf(ctx)).toEqual(['sid=a%20b; Path=/; HttpOnly; SameSite=Lax']);
    }
  });

  it('criterion 2: every option by its attribute name', () => {
    const ctx = ctxAt('https://app.dev/');
    const expires = new Date(Date.UTC(2030, 0, 2, 3, 4, 5));
    setCookie(ctx, 'sid', 'v', { maxAge: 60, expires, domain: 'app.dev', path: '/cuenta', sameSite: 'none', partitioned: true });
    setCookie(ctx, 'a', 'v', { sameSite: 'strict' });
    expect(cookiesOf(ctx)).toEqual([
      'sid=v; Max-Age=60; Expires=Wed, 02 Jan 2030 03:04:05 GMT; Domain=app.dev; Path=/cuenta; HttpOnly; Secure; SameSite=None; Partitioned',
      'a=v; Path=/; HttpOnly; Secure; SameSite=Strict',
    ]);
  });

  it('criterion 2: secure: false and httpOnly: false take them out; secure: true puts it on localhost', () => {
    const ctx = ctxAt('https://app.dev/');
    setCookie(ctx, 'sid', 'v', { secure: false, httpOnly: false });
    const local = ctxAt('http://localhost/');
    setCookie(local, 'sid', 'v', { secure: true });
    expect(cookiesOf(ctx)).toEqual(['sid=v; Path=/; SameSite=Lax']);
    expect(cookiesOf(local)).toEqual(['sid=v; Path=/; HttpOnly; Secure; SameSite=Lax']);
  });

  it('criterion 3: two setCookie are two Set-Cookie', () => {
    const ctx = ctxAt('https://app.dev/');
    setCookie(ctx, 'a', '1');
    setCookie(ctx, 'b', '2');
    expect(cookiesOf(ctx)).toHaveLength(2);
  });

  it('criterion 5: what a browser would drop throws a TypeError', () => {
    const ctx = ctxAt('https://app.dev/');
    for (const name of ['', 'a b', 'a;b', 'a=b']) {
      expect(() => setCookie(ctx, name, 'v')).toThrow(TypeError);
      expect(() => deleteCookie(ctx, name)).toThrow(TypeError);
    }
    expect(() => setCookie(ctx, 'sid', 'v', { sameSite: 'none', secure: false })).toThrow(/SameSite=None needs Secure/u);
    expect(() => setCookie(ctx, 'sid', 'v', { partitioned: true, secure: false })).toThrow(/Partitioned needs Secure/u);
    expect(cookiesOf(ctx)).toEqual([]);
  });
});

describe('deleteCookie', () => {
  it('criterion 4: Max-Age=0, with the path and the domain repeated', () => {
    const ctx = ctxAt('https://app.dev/');
    deleteCookie(ctx, 'sid');
    deleteCookie(ctx, 'sid', { path: '/cuenta', domain: 'app.dev' });
    expect(cookiesOf(ctx)).toEqual(['sid=; Path=/; Max-Age=0', 'sid=; Path=/cuenta; Domain=app.dev; Max-Age=0']);
  });
});

describe('serializeCookie', () => {
  it('criterion 6: the same text setCookie writes for the same host', () => {
    for (const url of ['https://app.dev/', 'http://localhost:5173/']) {
      const ctx = ctxAt(url);
      setCookie(ctx, 'sid', 'a b', { maxAge: 5 });
      expect(serializeCookie('sid', 'a b', { maxAge: 5, host: new URL(url).hostname })).toBe(cookiesOf(ctx)[0]);
    }
  });
});
