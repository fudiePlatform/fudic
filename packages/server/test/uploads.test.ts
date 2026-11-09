/**
 * SDD-81 §3.5, criteria 12, 17 and 23 on a real Node server: `createServer` with the server root's
 * handler of `@fudic/http`, mounted by `nodeMiddleware` on `node:http`, its uploads in `diskSpool`.
 * A file goes to a temporary file while its handler runs and is gone after; a limit answers `413`
 * before the client is done sending; neither 200 MB up nor 200 MB down goes through memory.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { open, rm, stat } from 'node:fs/promises';
import { createServer as listen, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fn, type FnSpec } from '@fudic/http/contract';
import { contractsHandler } from '@fudic/http/contract/server';
import { binWire } from '@fudic/http/wire/bin';
import { createServer } from '../src/index.js';
import { diskSpool, nodeMiddleware } from '../src/node/index.js';
import { testApp } from './helpers.js';

const MB = 1024 * 1024;
const BOUNDARY = 'fudicBoundary';

/** The temporary folders of uploads that exist now. */
const spools = (): string[] => readdirSync(tmpdir()).filter((name) => name.startsWith('fudic-upload-'));

let server: Server;
let port = 0;
/** What the handler saw of the disk while it ran. */
let during: { spools: string[]; path?: string } = { spools: [] };
let big = '';

const spec = (name: string, over: Partial<FnSpec>): FnSpec => ({ id: 'routes/uploads', name, method: 'PUT', chain: [], wire: binWire, ...over });

beforeAll(async () => {
  fn(spec('save', { args: { doc: 'file' }, files: true, returns: 'f64' })).handle(async (ctx: never) => {
    const { doc } = (ctx as { args: { doc: File } }).args;
    during = { spools: spools() };
    // Read it as a stream: the handler does not hold it either.
    let size = 0;
    for await (const chunk of doc.stream() as unknown as AsyncIterable<Uint8Array>) size += chunk.length;
    return size;
  });
  fn(spec('fail', { args: { doc: 'file' }, files: true })).handle(async () => {
    during = { spools: spools() };
    throw new Error('the handler broke');
  });
  fn(spec('small', { args: { doc: 'file' }, files: true, fileLimits: { doc: 2 * MB } })).handle(() => expect.unreachable());
  fn(spec('download', { method: 'GET', returns: 'file' })).handle(async () => {
    const { openAsBlob } = await import('node:fs');
    return new File([await openAsBlob(big)], 'big.bin', { type: 'application/octet-stream' });
  });
  const app = testApp({ functions: (options) => contractsHandler(options) });
  const fudic = createServer(app, { spool: diskSpool, uploads: { maxFileSize: 300 * MB }, secureCookies: false });
  const middleware = nodeMiddleware(fudic);
  server = listen((req, res) => middleware(req, res, () => res.writeHead(404).end()));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;

  // 200 MB on disk for the download, written in pieces.
  big = join(tmpdir(), `fudic-big-${process.pid}.bin`);
  const handle = await open(big, 'w');
  const chunk = Buffer.alloc(MB, 7);
  for (let i = 0; i < 200; i++) await handle.write(chunk);
  await handle.close();
}, 60_000);

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(big, { force: true });
});

interface Sent {
  readonly status: number;
  readonly body: string;
  /** Bytes of the file the client had written when the response came. */
  readonly written: number;
  /** The highest RSS seen while it ran. */
  readonly peak: number;
}

/**
 * A PUT of `name` with one file of `size` bytes, written in 1 MB pieces as the socket takes
 * them, and the RSS sampled meanwhile. It stops writing as soon as the response arrives.
 */
function upload(name: string, size: number): Promise<Sent> {
  return new Promise((resolve, reject) => {
    let written = 0;
    let answered = false;
    let peak = process.memoryUsage().rss;
    const sampler = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20);
    const head = Buffer.from(
      `--${BOUNDARY}\r\ncontent-disposition: form-data; name="$args"\r\ncontent-type: application/fud+bin\r\n\r\n\r\n` +
        `--${BOUNDARY}\r\ncontent-disposition: form-data; name="doc"; filename="big.bin"\r\ncontent-type: application/octet-stream\r\n\r\n`,
    );
    const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
    const req = request(
      { host: '127.0.0.1', port, method: 'PUT', path: `/_fudic/fn/routes/uploads/${name}`, headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` } },
      (res) => {
        answered = true;
        let body = '';
        res.setEncoding('latin1');
        res.on('data', (c: string) => (body += c));
        res.on('end', () => {
          clearInterval(sampler);
          resolve({ status: res.statusCode ?? 0, body, written, peak });
        });
      },
    );
    req.on('error', (error: NodeJS.ErrnoException) => {
      // The server closed the connection after its 413: the rest was never meant to be read.
      if (answered || error.code === 'ECONNRESET' || error.code === 'EPIPE') return;
      clearInterval(sampler);
      reject(error);
    });
    const piece = Buffer.alloc(MB, 1);
    const pump = (): void => {
      while (!answered && written < size) {
        const n = Math.min(MB, size - written);
        written += n;
        if (!req.write(n === MB ? piece : piece.subarray(0, n))) {
          req.once('drain', pump);
          return;
        }
      }
      if (!answered) req.end(tail);
    };
    req.write(head);
    pump();
  });
}

describe('diskSpool on a real server (criterion 17)', () => {
  it('a file waits in a temporary file during its handler, and is gone after', async () => {
    const before = spools();
    const sent = await upload('save', 5 * MB);
    expect(sent.status).toBe(200);
    expect(binWire.decodeValue('f64', Buffer.from(sent.body, 'latin1'))).toBe(5 * MB);
    expect(during.spools.filter((s) => !before.includes(s))).toHaveLength(1);
    await expect.poll(() => spools().filter((s) => !before.includes(s))).toEqual([]);
  });

  it('and gone after a handler that throws', async () => {
    const before = spools();
    const sent = await upload('fail', MB);
    expect(sent.status).toBe(500);
    expect(during.spools.filter((s) => !before.includes(s))).toHaveLength(1);
    await expect.poll(() => spools().filter((s) => !before.includes(s))).toEqual([]);
  });

  it('200 MB up do not raise the resident memory by 100 MB', async () => {
    const base = process.memoryUsage().rss;
    const sent = await upload('save', 200 * MB);
    expect(sent.status).toBe(200);
    expect(binWire.decodeValue('f64', Buffer.from(sent.body, 'latin1'))).toBe(200 * MB);
    expect((sent.peak - base) / MB).toBeLessThan(100);
  }, 120_000);
});

describe('criterion 12 on a real server: the 413 comes before the upload is done', () => {
  it('past max-size the server answers and closes; the client never sends the rest', async () => {
    const sent = await upload('small', 100 * MB);
    expect(sent.status).toBe(413);
    expect(binWire.decodeProblem(Buffer.from(sent.body, 'latin1')).detail).toBe(`file "doc" is larger than ${2 * MB} bytes`);
    expect(sent.written).toBeLessThan(50 * MB);
  }, 60_000);
});

describe('criterion 23: 200 MB down are not gathered in memory', () => {
  it('the response streams the file from disk', async () => {
    expect((await stat(big)).size).toBe(200 * MB);
    const base = process.memoryUsage().rss;
    let peak = base;
    const sampler = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 20);
    const { status, received, headers } = await new Promise<{ status: number; received: number; headers: Record<string, unknown> }>((resolve, reject) => {
      request({ host: '127.0.0.1', port, path: '/_fudic/fn/routes/uploads/download' }, (res) => {
        let received = 0;
        res.on('data', (c: Buffer) => (received += c.length));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, received, headers: res.headers }));
      })
        .on('error', reject)
        .end();
    });
    clearInterval(sampler);
    expect(status).toBe(200);
    expect(headers['content-length']).toBe(String(200 * MB));
    expect(received).toBe(200 * MB);
    expect((peak - base) / MB).toBeLessThan(100);
  }, 120_000);
});

describe('diskSpool on its own', () => {
  it('release with nothing put does nothing; put twice, two files in one folder, all removed', async () => {
    await expect(diskSpool().release()).resolves.toBeUndefined();
    const spool = diskSpool();
    const before = spools();
    const a = await spool.put(new Response('first').body!, { name: 'a.txt', type: 'text/plain' });
    const b = await spool.put(new Response('second').body!, { name: 'b.bin', type: '' });
    expect([a.name, a.type, await a.text()]).toEqual(['a.txt', 'text/plain', 'first']);
    expect([b.name, await b.text()]).toEqual(['b.bin', 'second']);
    const mine = spools().filter((s) => !before.includes(s));
    expect(mine).toHaveLength(1);
    expect(readdirSync(join(tmpdir(), mine[0]!))).toEqual(['0', '1']);
    await spool.release();
    expect(existsSync(join(tmpdir(), mine[0]!))).toBe(false);
  });
});
