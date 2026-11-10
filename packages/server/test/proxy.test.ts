/** Behind a proxy (SDD-81 §3.12, criteria 45 and 46). */

import { describe, expect, it } from 'vitest';
import { forwardedOrigin, publicRequest } from '../src/index.js';

const h = (headers: Record<string, string>): Headers => new Headers(headers);

describe('forwardedOrigin', () => {
  it('criterion 46: Forwarded wins over X-Forwarded-*', () => {
    expect(
      forwardedOrigin(h({ forwarded: 'proto=https;host=app.example', 'x-forwarded-proto': 'http', 'x-forwarded-host': 'other.example' })),
    ).toEqual({ proto: 'https', host: 'app.example' });
  });

  it('of Forwarded, the first entry, its pairs in any case and order, a quoted host unquoted', () => {
    expect(forwardedOrigin(h({ forwarded: 'for=1.2.3.4; Host="app.example:8443"; PROTO=HTTPS, proto=http;host=b' }))).toEqual({
      proto: 'https',
      host: 'app.example:8443',
    });
  });

  it('a pair without = is skipped', () => {
    expect(forwardedOrigin(h({ forwarded: 'secret;proto=https' }))).toEqual({ proto: 'https' });
  });

  it('criterion 46: a proto that is not http or https is ignored', () => {
    expect(forwardedOrigin(h({ forwarded: 'proto=ftp;host=app.example' }))).toEqual({ host: 'app.example' });
    expect(forwardedOrigin(h({ 'x-forwarded-proto': 'gopher' }))).toEqual({});
  });

  it('without Forwarded, the first value of X-Forwarded-Proto and X-Forwarded-Host', () => {
    expect(forwardedOrigin(h({ 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'app.example, inner' }))).toEqual({
      proto: 'https',
      host: 'app.example',
    });
  });

  it('a host that is not a host is ignored; an IPv6 one is a host', () => {
    expect(forwardedOrigin(h({ 'x-forwarded-host': 'evil.example/path' }))).toEqual({});
    expect(forwardedOrigin(h({ 'x-forwarded-host': 'a b' }))).toEqual({});
    expect(forwardedOrigin(h({ 'x-forwarded-host': '[::1]:3000' }))).toEqual({ host: '[::1]:3000' });
  });

  it('nothing, or an empty first value: nothing', () => {
    expect(forwardedOrigin(h({}))).toEqual({});
    expect(forwardedOrigin(h({ 'x-forwarded-proto': ' , https' }))).toEqual({});
  });
});

describe('publicRequest', () => {
  it('the scheme and host replaced; the old port goes with the old host', () => {
    const request = publicRequest(new Request('http://localhost:3000/a?b=1', { headers: { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.example' } }));
    expect(request.url).toBe('https://app.example/a?b=1');
  });

  it('only the scheme, keeping the host', () => {
    expect(publicRequest(new Request('http://app.example/a', { headers: { 'x-forwarded-proto': 'https' } })).url).toBe('https://app.example/a');
  });

  it('only the host, keeping the scheme', () => {
    expect(publicRequest(new Request('http://localhost:3000/a', { headers: { 'x-forwarded-host': 'app.example:8080' } })).url).toBe(
      'http://app.example:8080/a',
    );
  });

  it('nothing to change: the same request', () => {
    const plain = new Request('http://app.example/a');
    expect(publicRequest(plain)).toBe(plain);
    const same = new Request('https://app.example/a', { headers: { 'x-forwarded-proto': 'https' } });
    expect(publicRequest(same)).toBe(same);
  });

  it('the method, headers, signal and body go along, the body as a stream never read', async () => {
    const controller = new AbortController();
    const request = publicRequest(
      new Request('http://localhost/x', {
        method: 'POST',
        headers: { 'x-forwarded-proto': 'https', 'x-one': '1' },
        body: 'payload',
        signal: controller.signal,
      }),
    );
    expect(request.method).toBe('POST');
    expect(request.headers.get('x-one')).toBe('1');
    expect(await request.text()).toBe('payload');
    controller.abort();
    expect(request.signal.aborted).toBe(true);
  });
});
