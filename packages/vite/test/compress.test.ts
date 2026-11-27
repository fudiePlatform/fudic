/**
 * Finding 1 of the website: the preview compresses what it serves. `negotiate` reads
 * `Accept-Encoding`; the middleware is driven through a real `node:http` server, written to the
 * way `@fudic/server` (setHeader, then chunks) and `sirv` (writeHead with an object, then a pipe)
 * write, and its answers are decoded back.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, request, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { type AddressInfo } from 'node:net';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { compression, MIN_SIZE, negotiate } from '../src/compress.js';

describe('negotiate', () => {
  it.each([
    [undefined, undefined],
    ['', undefined],
    ['gzip, deflate, br', 'br'],
    ['gzip', 'gzip'],
    ['br', 'br'],
    ['br;q=0, gzip', 'gzip'],
    ['gzip;q=1, br;q=0.5', 'gzip'],
    ['gzip;q=0.5, br;q=0.5', 'br'],
    ['BR', 'br'],
    ['*', 'br'],
    ['*;q=0', undefined],
    ['identity', undefined],
    ['deflate', undefined],
    ['br;q=abc, gzip', 'gzip'],
    ['br;level=1', 'br'],
    ['gzip;q=0, br;q=0', undefined],
  ])('%j answers with %j', (header, expected) => {
    expect(negotiate(header)).toBe(expected);
  });
});

/** A page big enough to be compressed. */
const PAGE = `<!DOCTYPE html><html><body>${'<p>Fudic</p>'.repeat(200)}</body></html>`;

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const handlers = new Map<string, Handler>();
let server: Server;
let port = 0;

beforeAll(async () => {
  const compress = compression();
  server = createServer((req, res) => {
    compress(req, res, () => {
      const handler = handlers.get(req.url ?? '');
      if (handler === undefined) throw new Error(`no handler for ${req.url}`);
      handler(req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

interface Answer {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly raw: Buffer;
  /** The body, decoded from its `Content-Encoding`. */
  readonly text: string;
}

let next = 0;

/** `handler` answers a fresh path; the answer to a request with `headers`. */
function ask(handler: Handler, headers: Record<string, string> = {}, method = 'GET'): Promise<Answer> {
  const path = `/${(next += 1)}`;
  handlers.set(path, handler);
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];
        const decoded = raw.length === 0 ? raw : encoding === 'br' ? brotliDecompressSync(raw) : encoding === 'gzip' ? gunzipSync(raw) : raw;
        resolve({ status: res.statusCode ?? 0, headers: res.headers, raw, text: decoded.toString('utf8') });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const html: Handler = (_req, res) => {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.end(PAGE);
};

describe('compression', () => {
  it('compresses a page with brotli, says how and varies on Accept-Encoding', async () => {
    const answer = await ask(html, { 'accept-encoding': 'gzip, deflate, br' });
    expect(answer.headers['content-encoding']).toBe('br');
    expect(answer.headers['vary']).toBe('Accept-Encoding');
    expect(answer.headers['content-length']).toBeUndefined();
    expect(answer.raw.length).toBeLessThan(PAGE.length / 4);
    expect(answer.text).toBe(PAGE);
  });

  it('compresses with gzip when the client takes only gzip', async () => {
    const answer = await ask(html, { 'accept-encoding': 'gzip' });
    expect(answer.headers['content-encoding']).toBe('gzip');
    expect(answer.text).toBe(PAGE);
  });

  it('sends a page as it is, and still varies, when the client takes neither', async () => {
    const answer = await ask(html);
    expect(answer.headers['content-encoding']).toBeUndefined();
    expect(answer.headers['vary']).toBe('Accept-Encoding');
    expect(answer.text).toBe(PAGE);
  });

  it('sends a small body as it is', async () => {
    const small = 'x'.repeat(MIN_SIZE - 1);
    const answer = await ask((_req, res) => {
      res.setHeader('content-type', 'text/css');
      res.end(small);
    }, { 'accept-encoding': 'br' });
    expect(answer.headers['content-encoding']).toBeUndefined();
    expect(answer.headers['vary']).toBe('Accept-Encoding');
    expect(answer.headers['content-length']).toBe(String(MIN_SIZE - 1));
    expect(answer.text).toBe(small);
  });

  it('leaves alone what is not text: a font, an image, a body without a type', async () => {
    for (const type of ['font/woff2', 'image/png', undefined]) {
      const answer = await ask((_req, res) => {
        if (type !== undefined) res.setHeader('content-type', type);
        res.end(PAGE);
      }, { 'accept-encoding': 'br' });
      expect(answer.headers['content-encoding'], String(type)).toBeUndefined();
      expect(answer.headers['vary'], String(type)).toBeUndefined();
    }
  });

  it('compresses every kind of text it knows', async () => {
    for (const type of ['text/javascript', 'application/javascript', 'application/json', 'application/manifest+json', 'image/svg+xml']) {
      const answer = await ask((_req, res) => {
        res.setHeader('content-type', type);
        res.end(PAGE);
      }, { 'accept-encoding': 'br' });
      expect(answer.headers['content-encoding'], type).toBe('br');
    }
  });

  it('never compresses twice, nor against no-transform', async () => {
    const encoded = await ask((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.setHeader('content-encoding', 'identity');
      res.end(PAGE);
    }, { 'accept-encoding': 'br' });
    expect(encoded.headers['content-encoding']).toBe('identity');
    const kept = await ask((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.setHeader('cache-control', 'public, no-transform');
      res.end(PAGE);
    }, { 'accept-encoding': 'br' });
    expect(kept.headers['content-encoding']).toBeUndefined();
  });

  it('leaves alone a status without a whole body: 204, 206, 304', async () => {
    for (const status of [204, 206, 304]) {
      const answer = await ask((_req, res) => {
        res.statusCode = status;
        res.setHeader('content-type', 'text/html');
        res.end(status === 206 ? PAGE : undefined);
      }, { 'accept-encoding': 'br' });
      expect(answer.status).toBe(status);
      expect(answer.headers['content-encoding'], String(status)).toBeUndefined();
    }
  });

  it('streams: writeHead with an object, then chunks, each out as it comes', async () => {
    const parts = ['<!DOCTYPE html>', PAGE, '<p>late</p>'];
    const answer = await ask((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html', 'x-skipped': undefined });
      expect(res.write(parts[0]!)).toBe(true);
      res.write(Buffer.from(parts[1]!), () => undefined);
      res.write(parts[2]!, 'utf8', () => undefined);
      res.end();
    }, { 'accept-encoding': 'br' });
    expect(answer.headers['content-encoding']).toBe('br');
    expect(answer.headers['x-skipped']).toBeUndefined();
    expect(answer.text).toBe(parts.join(''));
  });

  it('takes writeHead with a status message and a flat list of headers', async () => {
    const answer = await ask((_req, res) => {
      res.writeHead(200, 'Fine', ['content-type', 'text/html', 'content-length', String(Buffer.byteLength(PAGE))]);
      res.end(PAGE);
    }, { 'accept-encoding': 'gzip' });
    expect(answer.headers['content-encoding']).toBe('gzip');
    expect(answer.headers['content-length']).toBeUndefined();
    expect(answer.text).toBe(PAGE);
  });

  it('decides on the first write when nobody called writeHead', async () => {
    const answer = await ask((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.write(PAGE);
      res.end('!', 'utf8', () => undefined);
    }, { 'accept-encoding': 'br' });
    expect(answer.text).toBe(`${PAGE}!`);
  });

  it('calls the callback of end, with or without a body', async () => {
    let called = 0;
    await ask((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.write(PAGE);
      res.end(() => (called += 1));
    }, { 'accept-encoding': 'br' });
    await ask((_req, res) => {
      res.setHeader('content-type', 'text/html');
      res.end(PAGE, () => (called += 1));
    }, { 'accept-encoding': 'br' });
    await ask((_req, res) => {
      res.setHeader('content-type', 'font/woff2');
      res.end(() => (called += 1));
    }, { 'accept-encoding': 'br' });
    expect(called).toBe(3);
  });

  it('writes as it is what it does not compress, its callbacks kept', async () => {
    let called = 0;
    const answer = await ask((_req, res) => {
      res.setHeader('content-type', 'image/png');
      res.write('ab', () => (called += 1));
      res.end(Buffer.from('cd'));
    }, { 'accept-encoding': 'br' });
    expect(answer.text).toBe('abcd');
    expect(called).toBe(1);
  });

  it('weakens a strong ETag, and keeps a weak one or one that is not text', async () => {
    const etagOf = async (etag: string | number): Promise<string | undefined> =>
      (await ask((_req, res) => {
        res.setHeader('content-type', 'text/html');
        res.setHeader('etag', etag);
        res.end(PAGE);
      }, { 'accept-encoding': 'br' })).headers['etag'];
    expect(await etagOf('"abc"')).toBe('W/"abc"');
    expect(await etagOf('W/"abc"')).toBe('W/"abc"');
    expect(await etagOf(7)).toBe('7');
  });

  it('adds Accept-Encoding to a Vary that names others, and not twice', async () => {
    const varyOf = async (vary: string): Promise<string | undefined> =>
      (await ask((_req, res) => {
        res.setHeader('content-type', 'text/html');
        res.setHeader('vary', vary);
        res.end(PAGE);
      }, { 'accept-encoding': 'br' })).headers['vary'];
    expect(await varyOf('Origin')).toBe('Origin, Accept-Encoding');
    expect(await varyOf('accept-encoding')).toBe('accept-encoding');
    expect(await varyOf('*')).toBe('*');
  });

  it('decides once: a second writeHead is Node’s error, not a second compressor', async () => {
    const answer = await ask((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      expect(() => res.writeHead(200)).toThrow(/headers/iu);
      res.end(PAGE);
    }, { 'accept-encoding': 'br' });
    expect(answer.text).toBe(PAGE);
  });

  it('answers a HEAD with the headers a GET would have', async () => {
    const answer = await ask(html, { 'accept-encoding': 'br' }, 'HEAD');
    expect(answer.headers['content-encoding']).toBe('br');
    expect(answer.raw.length).toBe(0);
  });
});
