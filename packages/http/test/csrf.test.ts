/**
 * SDD-56 §6 criterion 35, its runtime part, and §4.11: the two halves of `csrf` against
 * contexts built by hand. The end-to-end half (a call from the stub passes) is the client's.
 */

import { describe, expect, it } from 'vitest';
import { csrf } from '../src/csrf.js';
import { HttpError } from '../src/errors.js';
import { halfOf } from '../src/middleware.js';
import { run } from '../src/compose.js';
import type { Method } from '../src/types.js';
import { clientCtx, serverCtx } from './helpers.js';

const server = [halfOf(csrf, 'server')!];
const pass = (method: Method, headers: Record<string, string>) =>
  run(server, serverCtx(method, headers), () => 'handled');

const ok = { 'x-fudic-csrf': '1' };

describe('the client half', () => {
  it('sets x-fudic-csrf: 1 and goes on', async () => {
    const ctx = clientCtx();
    let sent: Headers | undefined;
    await run([halfOf(csrf, 'client')!], ctx, (c) => {
      sent = c.headers;
    });
    expect(sent!.get('x-fudic-csrf')).toBe('1');
  });

  it('what the client half sends, the server half accepts', async () => {
    const ctx = clientCtx();
    await run([halfOf(csrf, 'client')!], ctx, () => {});
    await expect(pass('PUT', Object.fromEntries(ctx.headers))).resolves.toBe('handled');
  });
});

describe('the server half', () => {
  it('a PUT without the header is 403', async () => {
    const e = await pass('PUT', {}).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(HttpError);
    expect((e as HttpError).status).toBe(403);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)('%s with the header passes', async (m) => {
    await expect(pass(m, ok)).resolves.toBe('handled');
  });

  it('Sec-Fetch-Site: cross-site is 403, even with the header', async () => {
    await expect(pass('PUT', { ...ok, 'sec-fetch-site': 'cross-site' })).rejects.toMatchObject({ status: 403 });
  });

  it('Sec-Fetch-Site: same-site is 403 too: only same-origin passes', async () => {
    await expect(pass('PUT', { ...ok, 'sec-fetch-site': 'same-site' })).rejects.toMatchObject({ status: 403 });
  });

  it('Sec-Fetch-Site: same-origin passes', async () => {
    await expect(pass('PUT', { ...ok, 'sec-fetch-site': 'same-origin' })).resolves.toBe('handled');
  });

  it('an Origin of another host is 403', async () => {
    await expect(pass('PUT', { ...ok, origin: 'https://evil.test' })).rejects.toMatchObject({ status: 403 });
  });

  it('the Origin of the server passes', async () => {
    await expect(pass('PUT', { ...ok, origin: 'https://app.test' })).resolves.toBe('handled');
  });

  it('a GET without the header passes, whatever else it carries', async () => {
    await expect(pass('GET', {})).resolves.toBe('handled');
    await expect(
      pass('GET', { 'sec-fetch-site': 'cross-site', origin: 'https://evil.test' }),
    ).resolves.toBe('handled');
  });
});
