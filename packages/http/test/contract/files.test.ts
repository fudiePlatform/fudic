/**
 * SDD-81 §3.3–§3.5, §4.1–§4.3, criteria 6–16, 18–22, 24, 25 and 49: files on the wire, both ways,
 * from the stub of the browser to the real dispatcher and back, in one process. `fetch` hands the
 * dispatcher the very request the stub built and keeps a copy, so a test sees the cable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fn, resetRegistry, stub, type FnSpec } from '../../src/contract/index.js';
import { contractsHandler, type ContractsOptions } from '../../src/contract/server.js';
import { HttpError } from '../../src/errors.js';
import { filenameOf } from '../../src/client/codec.js';
import { DEFAULT_LIMITS, memorySpool, releasing } from '../../src/server/upload.js';
import type { Spool } from '../../src/server/uploads.js';
import type { Progress } from '../../src/types.js';
import { binWire } from '../../src/wire/bin.js';
import { jsonWire } from '../../src/wire/json.js';
import type { Ty } from '../../src/wire/ty.js';

const ORIGIN = 'https://app.test';
const MB = 1024 * 1024;

let n = 0;
/** A fresh `<id>` per declaration: the registry keeps the last of each. */
const nextId = (): string => `components/files${++n}`;

beforeEach(() => vi.stubGlobal('location', { origin: ORIGIN, pathname: '/usuarios' }));
afterEach(() => {
  vi.unstubAllGlobals();
  resetRegistry();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Handler = (ctx: any) => unknown;

/** A function, both halves, and a `fetch` that serves it and keeps what crossed the wire. */
function pair(over: Partial<FnSpec>, handler: Handler, options: ContractsOptions = {}) {
  const spec: FnSpec = { id: nextId(), name: 'save', method: 'PUT', chain: [], wire: binWire, ...over };
  fn(spec).handle(handler as never);
  const handle = contractsHandler(options);
  const seen: Request[] = [];
  vi.stubGlobal('fetch', async (url: URL, init: RequestInit) => {
    const request = new Request(url, init);
    seen.push(request.clone());
    return handle(request);
  });
  const call = stub<never, any, any>(spec) as unknown as ((args?: unknown, options?: object) => Promise<any>) & { url: (args?: unknown, o?: object) => string };
  return { spec, call, seen, handle, url: `${ORIGIN}/_fudic/fn/${spec.id}/save` };
}

/** The parts of a multipart request, in order, with their file names and texts. */
async function partsOf(request: Request) {
  const form = await request.formData();
  return Promise.all(
    [...form].map(async ([name, v]) => ({
      name,
      ...(v instanceof File ? { filename: v.name, type: v.type, text: await v.text() } : { text: v }),
    })),
  );
}

const png = (name = 'yo.png', bytes: BlobPart = 'PNGDATA'): File => new File([bytes], name, { type: 'image/png', lastModified: 1_700_000_000_000 });

/** A multipart body written by hand, as `curl -F` would. */
function multipart(parts: readonly { name: string; filename?: string; type?: string; body: string | Uint8Array }[], boundary = 'cUrLbOuNdArY') {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  for (const p of parts) {
    const disp = `form-data; name="${p.name}"${p.filename !== undefined ? `; filename="${p.filename}"` : ''}`;
    chunks.push(enc.encode(`--${boundary}\r\ncontent-disposition: ${disp}\r\n${p.type !== undefined ? `content-type: ${p.type}\r\n` : ''}\r\n`));
    chunks.push(typeof p.body === 'string' ? enc.encode(p.body) : p.body);
    chunks.push(enc.encode('\r\n'));
  }
  chunks.push(enc.encode(`--${boundary}--\r\n`));
  return { body: new Blob(chunks as BlobPart[]), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

/** The problem of a refused response, in the function's format. */
const problemOf = async (response: Response, wire = binWire) => wire.decodeProblem(new Uint8Array(await response.arrayBuffer()));

const TYPES = { name: 'str', avatar: 'file', fotos: { list: 'file' }, doc: { fields: () => ({ title: 'str', adjunto: 'file' }) } } satisfies Record<string, Ty>;

describe('criterion 6: a call with files is multipart, $args first, each part by its path', () => {
  it('in fud-bin', async () => {
    let got: any;
    const { call, seen } = pair({ args: TYPES, files: true }, (ctx) => void (got = ctx.args));
    const avatar = png();
    const f0 = png('a.png');
    const f1 = png('b.png');
    const adj = new File(['%PDF'], 'adj.pdf', { type: 'application/pdf' });
    await call({ name: 'Ana', avatar, fotos: [f0, f1], doc: { title: 'T', adjunto: adj } });
    const request = seen[0]!;
    expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/u);
    const parts = await partsOf(request);
    expect(parts.map((p) => p.name)).toEqual(['$args', 'avatar', 'fotos.0', 'fotos.1', 'doc.adjunto']);
    expect(parts[0]).toMatchObject({ filename: 'blob', type: 'application/fud+bin' });
    expect(parts[1]).toEqual({ name: 'avatar', filename: 'yo.png', type: 'image/png', text: 'PNGDATA' });
    // What the handler gets is the value the browser sent, its files in their places.
    expect(got.name).toBe('Ana');
    expect(got.fotos.map((f: File) => f.name)).toEqual(['a.png', 'b.png']);
    expect(got.doc).toMatchObject({ title: 'T' });
    expect(await got.doc.adjunto.text()).toBe('%PDF');
  });

  it('in JSON with use json: $args is application/json, without the file keys', async () => {
    const { call, seen } = pair({ args: TYPES, files: true, wire: jsonWire }, () => undefined);
    await call({ name: 'Ana', avatar: png(), fotos: [], doc: { title: 'T', adjunto: png('d.png') } });
    const [args, ...files] = await partsOf(seen[0]!);
    expect(args).toMatchObject({ name: '$args', type: 'application/json' });
    expect(JSON.parse(args!.text)).toEqual({ name: 'Ana', doc: { title: 'T' } });
    expect(files.map((p) => p.name)).toEqual(['avatar', 'doc.adjunto']);
  });

  it('a call whose signature may carry files is multipart even when it carries none, and is never compressed', async () => {
    const { call, seen } = pair({ args: { note: 'str', cover: { opt: 'file' } }, files: true }, () => undefined);
    await call({ note: 'x' });
    expect(seen[0]!.headers.get('content-type')).toMatch(/^multipart\/form-data/u);
    expect(seen[0]!.headers.has('content-encoding')).toBe(false);
    expect((await partsOf(seen[0]!)).map((p) => p.name)).toEqual(['$args']);
  });
});

describe('criterion 7: a file? without a file', () => {
  it('no part for it, and the handler gets undefined', async () => {
    let got: any;
    const { call, seen } = pair({ args: { note: 'str', cover: { opt: 'file' } }, files: true }, (ctx) => void (got = ctx.args));
    await call({ note: 'x' });
    expect((await partsOf(seen[0]!)).map((p) => p.name)).toEqual(['$args']);
    expect(got).toEqual({ note: 'x' });
    expect('cover' in got).toBe(false);
  });
});

describe('criterion 8: a function without file sends what it sent before', () => {
  it('not multipart: its own format, byte for byte what the wire encodes', async () => {
    const { call, seen } = pair({ args: { name: 'str', age: 'i32' } }, () => undefined);
    await call({ name: 'Ana', age: 30 });
    expect(seen[0]!.headers.get('content-type')).toBe('application/fud+bin');
    expect(new Uint8Array(await seen[0]!.arrayBuffer())).toEqual(binWire.encodeArgs({ name: 'str', age: 'i32' }, { name: 'Ana', age: 30 }));
  });
});

describe('criterion 9: what curl -F sends works against a use json function', () => {
  it('$args as application/json and a file part', async () => {
    let got: any;
    const { handle, url } = pair({ args: { note: 'str', avatar: 'file' }, files: true, wire: jsonWire }, (ctx) => void (got = ctx.args));
    const { body, headers } = multipart([
      { name: '$args', type: 'application/json', filename: 'args.json', body: '{"note":"hola"}' },
      { name: 'avatar', filename: 'yo.png', type: 'image/png', body: 'PNG' },
    ]);
    const response = await handle(new Request(url, { method: 'PUT', body, headers: { ...headers, 'x-fudic-csrf': '1' } }));
    expect(response!.status).toBe(204);
    expect(got.note).toBe('hola');
    expect(got.avatar.name).toBe('yo.png');
  });
});

describe('criterion 10: the signature of a function with file', () => {
  it('a page built against the old one is refused as stale', async () => {
    const { handle, url } = pair({ args: { avatar: 'file' }, files: true, sig: 'new-sig' }, () => undefined);
    const { body, headers } = multipart([{ name: '$args', type: 'application/fud+bin', body: '' }]);
    const response = await handle(new Request(url, { method: 'PUT', body, headers: { ...headers, 'fud-sig': 'old-sig' } }));
    // The status of a stale page is SDD-67's (412); SDD-81 criterion 10 calls it "409".
    expect(response!.status).toBe(412);
  });
});

describe('the server receives (criteria 11–16, 18)', () => {
  it('criterion 11: the handler gets a File with its name, type, size and bytes', async () => {
    let got: File | undefined;
    const bytes = new Uint8Array(70_000).map((_, i) => (i * 31) % 256);
    const { call } = pair({ args: { avatar: 'file' }, files: true }, (ctx) => void (got = ctx.args.avatar));
    await call({ avatar: new File([bytes], 'número.bin', { type: 'application/x-test' }) });
    expect(got).toBeInstanceOf(File);
    expect(got!.name).toBe('número.bin');
    expect(got!.type).toBe('application/x-test');
    expect(got!.size).toBe(70_000);
    expect(new Uint8Array(await got!.arrayBuffer())).toEqual(bytes);
  });

  /** A body that is endless in practice, and how much of it was asked for. */
  function endless(head: string, total: number) {
    const enc = new TextEncoder();
    let pulled = 0;
    const chunk = new Uint8Array(64 * 1024).fill(65);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(head));
      },
      pull(controller) {
        if (pulled >= total) {
          controller.close();
          return;
        }
        pulled += chunk.length;
        controller.enqueue(chunk);
      },
    });
    return { body, pulled: () => pulled };
  }

  const fileHead = (boundary: string, args = ''): string =>
    `--${boundary}\r\ncontent-disposition: form-data; name="$args"\r\ncontent-type: application/fud+bin\r\n\r\n${args}\r\n--${boundary}\r\ncontent-disposition: form-data; name="avatar"; filename="big.bin"\r\n\r\n`;

  it('criterion 12: past max-size, a 413 naming the field, and the rest of the body is never read', async () => {
    const { handle, url } = pair({ args: { avatar: 'file' }, files: true, fileLimits: { avatar: 2 * MB } }, () => expect.unreachable());
    const { body, pulled } = endless(fileHead('b'), 50 * MB);
    const response = await handle(new Request(url, { method: 'PUT', body, headers: { 'content-type': 'multipart/form-data; boundary=b' }, duplex: 'half' } as RequestInit));
    expect(response!.status).toBe(413);
    expect((await problemOf(response!)).detail).toBe(`file "avatar" is larger than ${2 * MB} bytes`);
    expect(pulled()).toBeLessThan(4 * MB);
  });

  it('criterion 13: without max-size, maxFileSize of the options; without them, 10 MB', async () => {
    const small = pair({ args: { avatar: 'file' }, files: true }, () => undefined, { uploads: { maxFileSize: 1000 } });
    const tooBig = await small.call({ avatar: png('x', 'x'.repeat(1001)) }).catch((e: unknown) => e);
    expect(tooBig).toBeInstanceOf(HttpError);
    expect((tooBig as HttpError).status).toBe(413);
    await expect(small.call({ avatar: png('x', 'x'.repeat(1000)) })).resolves.toBeUndefined();

    expect(DEFAULT_LIMITS).toEqual({ maxFileSize: 10 * MB, maxFiles: 20, maxArgs: MB });
    const fallback = pair({ args: { avatar: 'file' }, files: true }, () => undefined);
    const { body, pulled } = endless(fileHead('b'), 30 * MB);
    const response = await fallback.handle(
      new Request(fallback.url, { method: 'PUT', body, headers: { 'content-type': 'multipart/form-data; boundary=b' }, duplex: 'half' } as RequestInit),
    );
    expect(response!.status).toBe(413);
    expect((await problemOf(response!)).detail).toBe(`file "avatar" is larger than ${10 * MB} bytes`);
    expect(pulled()).toBeLessThan(12 * MB);
  });

  it('the max-size of a file[] counts each of its files', async () => {
    const { call } = pair({ args: { docs: { list: 'file' } }, files: true, fileLimits: { docs: 10 } }, () => undefined);
    await expect(call({ docs: [png('a', '0123456789'), png('b', '0123456789')] })).resolves.toBeUndefined();
    await expect(call({ docs: [png('a', '0123456789'), png('b', '01234567890')] })).rejects.toMatchObject({ status: 413 });
  });

  it('criterion 14: 21 files with maxFiles 20 is a 413; so is $args past maxArgs', async () => {
    const { call } = pair({ args: { docs: { list: 'file' }, note: 'str' }, files: true }, () => undefined, { uploads: { maxArgs: 1024 } });
    const files = (count: number): File[] => Array.from({ length: count }, (_, i) => png(`${i}.png`, 'x'));
    await expect(call({ docs: files(20), note: '' })).resolves.toBeUndefined();
    const many = await call({ docs: files(21), note: '' }).catch((e: unknown) => e as HttpError);
    expect(many).toMatchObject({ status: 413 });
    expect((many as HttpError).problem.detail).toBe('more than 20 files');
    const args = await call({ docs: [], note: 'x'.repeat(2048) }).catch((e: unknown) => e as HttpError);
    expect(args).toMatchObject({ status: 413 });
    expect((args as HttpError).problem.detail).toBe('$args is larger than 1024 bytes');
  });

  it('criterion 15 (its server half): a rule under the file is checked with the File it received', async () => {
    // `accept` itself is @fudic/forms's (phase 5); here a rule of the same shape stands in for it.
    const accept = (types: string) => (v: File | null) => (v === null || types.split(',').some((t) => v.name.endsWith(t.trim())) ? null : { code: 'accept' });
    const { call } = pair(
      { args: { avatar: 'file' }, files: true, rules: { avatar: [{ check: accept('.png, .jpg') as never, name: 'accept', args: ['.png, .jpg'], text: 'Solo imágenes.' }] } },
      () => undefined,
    );
    await expect(call({ avatar: png('ok.png') })).resolves.toBeUndefined();
    const refused = await call({ avatar: new File(['MZ'], 'virus.exe') }).catch((e: unknown) => e as HttpError);
    expect(refused).toMatchObject({ status: 400 });
    expect((refused as HttpError).problem.detail).toBe('Solo imágenes.');
  });

  it('criterion 16: a part whose name is no file slot is a 400 multipart body:', async () => {
    const { handle, url } = pair({ args: { avatar: 'file', note: 'str' }, files: true }, () => expect.unreachable());
    for (const [name, detail] of [
      ['note', 'multipart body: no file goes at "note"'],
      ['ghost', 'multipart body: no file goes at "ghost"'],
      ['avatar.0', 'multipart body: no file goes at "avatar.0"'],
    ] as const) {
      const { body, headers } = multipart([
        { name: '$args', type: 'application/fud+bin', body: '' },
        { name, filename: 'x', body: 'x' },
      ]);
      const response = await handle(new Request(url, { method: 'PUT', body, headers }));
      expect(response!.status).toBe(400);
      expect((await problemOf(response!)).detail).toBe(detail);
    }
  });

  it('the shape of the body: another content type 415, $args not first or missing 400, two parts at one path 400, $args of another format 415', async () => {
    const { handle, url } = pair({ args: { avatar: 'file' }, files: true }, () => undefined);
    const send = (body: BodyInit, headers: Record<string, string>) => handle(new Request(url, { method: 'PUT', body, headers }));
    const json = await send('{}', { 'content-type': 'application/json' });
    expect(json!.status).toBe(415);
    const cases: readonly [Parameters<typeof multipart>[0], number, string][] = [
      [[{ name: 'avatar', filename: 'x', body: 'x' }], 400, 'multipart body: the first part is "avatar", not $args'],
      [[], 400, 'multipart body: no $args part'],
      [
        [
          { name: '$args', type: 'application/fud+bin', body: '' },
          { name: 'avatar', filename: 'a', body: 'a' },
          { name: 'avatar', filename: 'b', body: 'b' },
        ],
        400,
        'multipart body: two parts at "avatar"',
      ],
      [[{ name: '$args', type: 'application/json', body: '{}' }], 415, '$args is "application/json"'],
    ];
    for (const [parts, status, detail] of cases) {
      const { body, headers } = multipart(parts);
      const response = await send(body, headers);
      expect(response!.status, detail).toBe(status);
      expect((await problemOf(response!)).detail).toBe(detail);
    }
    const empty = await handle(new Request(url, { method: 'PUT', headers: { 'content-type': 'multipart/form-data; boundary=x' } }));
    expect((await problemOf(empty!)).detail).toBe('multipart body: empty');
  });

  it('criterion 18: a Spool of its own gets the bytes, its File reaches the handler, and it is released after the response', async () => {
    const put = vi.fn(async (bytes: ReadableStream<Uint8Array>, meta: { name: string; type: string }) => {
      const text = await new Response(bytes).text();
      return new File([`spooled:${text}`], meta.name, { type: meta.type });
    });
    const release = vi.fn(async () => undefined);
    let got: File | undefined;
    const { call } = pair({ args: { avatar: 'file' }, files: true }, (ctx) => void (got = ctx.args.avatar), { spool: () => ({ put, release }) });
    await call({ avatar: png('a.png', 'abc') });
    expect(put).toHaveBeenCalledWith(expect.any(ReadableStream), { name: 'a.png', type: 'image/png' });
    expect(await got!.text()).toBe('spooled:abc');
    expect(release).toHaveBeenCalledOnce();
  });

  it('criterion 18: without one, in memory', async () => {
    const spool = memorySpool();
    const file = await spool.put(new Response('bytes').body!, { name: 'm.txt', type: 'text/plain' });
    expect(file).toBeInstanceOf(File);
    expect(await file.text()).toBe('bytes');
    await expect(spool.release()).resolves.toBeUndefined();
  });

  it('a function that cannot carry files gets no spool', async () => {
    const spool = vi.fn((): Spool => expect.unreachable());
    const { call } = pair({ args: { name: 'str' } }, () => undefined, { spool });
    await call({ name: 'x' });
    expect(spool).not.toHaveBeenCalled();
  });
});

describe('criterion 49: multipart from another site is refused, csrf or not', () => {
  it('Sec-Fetch-Site that is not same-origin, or an Origin of another host: 403 before a byte is read', async () => {
    const { handle, url } = pair({ args: { avatar: 'file' }, files: true }, () => expect.unreachable());
    for (const headers of [{ 'sec-fetch-site': 'cross-site' }, { 'sec-fetch-site': 'same-site' }, { origin: 'https://evil.test' }]) {
      const { body, headers: type } = multipart([{ name: '$args', type: 'application/fud+bin', body: '' }]);
      const response = await handle(new Request(url, { method: 'PUT', body, headers: { ...type, ...headers } }));
      expect(response!.status).toBe(403);
    }
  });

  it('the same origin, or a client that says neither (curl), passes', async () => {
    const { handle, url } = pair({ args: { avatar: { opt: 'file' } }, files: true }, () => undefined);
    for (const headers of [{ 'sec-fetch-site': 'same-origin', origin: ORIGIN }, {}]) {
      const { body, headers: type } = multipart([{ name: '$args', type: 'application/fud+bin', body: '' }]);
      expect((await handle(new Request(url, { method: 'PUT', body, headers: { ...type, ...headers } })))!.status).toBe(204);
    }
  });
});

describe('the way back (criteria 19–21)', () => {
  it('criterion 19: -> file streams the body with its type, an inline UTF-8 name, its length and date; the client gets that File', async () => {
    const file = new File(['col1,col2\n'], "personas (año) 'final'.csv", { type: 'text/csv', lastModified: Date.UTC(2026, 10, 9) });
    const { handle, url, call } = pair({ method: 'GET', returns: 'file' }, () => file);
    const response = (await handle(new Request(url)))!;
    expect(response.headers.get('content-type')).toBe('text/csv');
    expect(response.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''personas%20%28a%C3%B1o%29%20%27final%27.csv");
    expect(response.headers.get('content-length')).toBe('10');
    expect(response.headers.get('last-modified')).toBe('Mon, 09 Nov 2026 00:00:00 GMT');
    const got = (await call()) as File;
    expect(got).toBeInstanceOf(File);
    expect(got.name).toBe("personas (año) 'final'.csv");
    expect(got.type).toBe('text/csv');
    expect(got.lastModified).toBe(Date.UTC(2026, 10, 9));
    expect(await got.text()).toBe('col1,col2\n');
  });

  it('a file without a type or a name: octet-stream, inline; a Blob returned is a nameless file', async () => {
    const { handle, url } = pair({ method: 'GET', returns: 'file' }, () => new Blob(['raw']));
    const response = (await handle(new Request(url)))!;
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toBe('inline');
    expect(await response.text()).toBe('raw');
  });

  it('criterion 20: -> file? with undefined is a 204, and undefined in the client', async () => {
    const { handle, url, call } = pair({ method: 'GET', returns: { opt: 'file' } }, () => undefined);
    expect((await handle(new Request(url)))!.status).toBe(204);
    await expect(call()).resolves.toBeUndefined();
  });

  it('criterion 21: -> Doc with a file inside comes back multipart, $value first, and the client puts it back together', async () => {
    const Doc: Ty = { fields: () => ({ title: 'str', adjunto: 'file', extras: { list: 'file' } }) };
    const adj = new File(['%PDF-1'], 'adj.pdf', { type: 'application/pdf' });
    const { handle, url, call } = pair({ method: 'GET', returns: Doc }, () => ({ title: 'T', adjunto: adj, extras: [png('e.png')] }));
    const response = (await handle(new Request(url)))!;
    expect(response.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/u);
    const form = await response.formData();
    expect([...form.keys()]).toEqual(['$value', 'adjunto', 'extras.0']);
    const got = await call();
    expect(got.title).toBe('T');
    expect(got.adjunto).toBeInstanceOf(File);
    expect(got.adjunto.name).toBe('adj.pdf');
    expect(await got.adjunto.text()).toBe('%PDF-1');
    expect(got.extras.map((f: File) => f.name)).toEqual(['e.png']);
  });

  it('and in JSON too', async () => {
    const Doc: Ty = { fields: () => ({ title: 'str', adjunto: { opt: 'file' } }) };
    const { call } = pair({ method: 'GET', returns: Doc, wire: jsonWire }, () => ({ title: 'T', adjunto: png('j.png') }));
    const got = await call();
    expect(got.title).toBe('T');
    expect(got.adjunto.name).toBe('j.png');
  });

  it('a multipart value without $value is a 502 in the client', async () => {
    const Doc: Ty = { fields: () => ({ adjunto: 'file' }) };
    const { call } = pair({ method: 'GET', returns: Doc }, () => undefined);
    const form = new FormData();
    form.append('adjunto', png());
    vi.stubGlobal('fetch', async () => new Response(form));
    await expect(call()).rejects.toMatchObject({ status: 502 });
  });

  it('a problem travels as always, never multipart', async () => {
    const { handle, url } = pair({ method: 'GET', returns: 'file' }, () => {
      throw new HttpError({ status: 404, title: 'Not Found' });
    });
    const response = (await handle(new Request(url)))!;
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toBe('application/problem+fud');
  });

  it('filenameOf: filename* first, then filename, then none; a filename* that does not decode falls back', () => {
    expect(filenameOf("attachment; filename*=UTF-8''n%C3%BAmero.png; filename=\"numero.png\"")).toBe('número.png');
    expect(filenameOf('attachment; filename="plain.txt"')).toBe('plain.txt');
    expect(filenameOf("inline; filename*=UTF-8''%E0%A4%A; filename=fallback.bin")).toBe('fallback.bin');
    expect(filenameOf("inline; filename*=UTF-8''%E0%A4%A")).toBe('');
    expect(filenameOf('inline')).toBe('');
    expect(filenameOf(null)).toBe('');
  });

  it('a date the server did not give is left to the File', async () => {
    const { call } = pair({ method: 'GET', returns: 'file' }, () => undefined);
    vi.stubGlobal('fetch', async () => new Response('x', { headers: { 'content-type': 'text/plain', 'last-modified': 'not a date' } }));
    const got = (await call()) as File;
    expect(got.name).toBe('');
    expect(got.lastModified).toBeGreaterThan(0);
  });
});

describe('criterion 22: url() of a get', () => {
  it('the URL with base, the route and query filled, the body arguments in ?a=', () => {
    const { call, spec } = pair(
      { method: 'GET', base: '/app/', name: 'avatar', route: [':id'], params: { id: 'i32' }, query: { size: 'str' }, args: { v: 'i32' }, returns: 'file' } as Partial<FnSpec>,
      () => undefined,
    );
    const a = binWire.encodeArgs({ v: 'i32' }, { v: 2 }) as Uint8Array;
    const url = call.url({ id: 3, size: 'big', v: 2 });
    expect(url.startsWith(`/app/_fudic/fn/${spec.id}/avatar/3?size=big&a=`)).toBe(true);
    expect(new URLSearchParams(url.split('?')[1]).get('a')).toBe(Buffer.from(a).toString('base64url'));
  });

  it('JSON args travel as text; no args, no ?a=; the page params given', () => {
    const json = pair({ method: 'GET', name: 'grab', args: { q: 'str' }, wire: jsonWire, returns: 'file' }, () => undefined);
    expect(json.call.url({ q: 'é' })).toBe(`/_fudic/fn/${json.spec.id}/grab?a=${encodeURIComponent('{"q":"é"}').replace(/%20/gu, '+')}`);
    const bare = pair({ method: 'GET', name: 'grab', id: 'routes/blog/[slug]', page: '/blog/:slug', returns: 'file' }, () => undefined);
    expect(bare.call.url(undefined, { params: { slug: 'hola' } })).toBe('/_fudic/fn/routes/blog/hola/grab');
  });

  it('a function that is not a get has no URL: TypeError, in the browser and on the server', () => {
    const spec: FnSpec = { id: nextId(), name: 'save', method: 'PUT', chain: [], wire: binWire };
    expect(() => (stub(spec) as unknown as { url: () => string }).url()).toThrow(TypeError);
    expect(() => (fn(spec) as unknown as { url: () => string }).url()).toThrow('save of ' + spec.id + ' is not a get: only a get has a URL');
  });

  it('the server variant paints the same URL: an <img src> of a server render', () => {
    const spec: FnSpec = { id: nextId(), name: 'avatar', method: 'GET', route: [':id'], params: { id: 'i32' }, chain: [], wire: binWire, returns: 'file' };
    const server = fn(spec) as unknown as { url: (a: unknown) => string };
    expect(server.url({ id: 7 })).toBe(`/_fudic/fn/${spec.id}/avatar/7`);
    vi.stubGlobal('location', undefined);
    expect(server.url({ id: 8 })).toBe(`/_fudic/fn/${spec.id}/avatar/8`);
  });
});

/**
 * An `XMLHttpRequest` in front of the dispatcher, as the browser's: it reports the upload as
 * `upload.onprogress`, the download as `onprogress`, and stops at `abort()`.
 */
function fakeXhr(handle: (r: Request) => Promise<Response | null>, { hold = false } = {}) {
  const made: any[] = [];
  class FakeXhr {
    upload: { onprogress?: (e: unknown) => void } = {};
    onprogress?: (e: unknown) => void;
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    responseType = '';
    status = 0;
    statusText = '';
    response: Blob | null = null;
    method = '';
    url = '';
    headers = new Headers();
    private answered = new Headers();
    aborted = false;
    constructor() {
      made.push(this);
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers.set(name, value);
    }
    getAllResponseHeaders() {
      return [...this.answered].map(([k, v]) => `${k}: ${v}`).join('\r\n') + '\r\n';
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
    send(body: FormData) {
      void (async () => {
        const request = new Request(this.url, { method: this.method, headers: this.headers, body });
        const size = Number((await request.clone().arrayBuffer()).byteLength);
        this.upload.onprogress?.({ loaded: size / 2, total: size, lengthComputable: true });
        this.upload.onprogress?.({ loaded: size, total: size, lengthComputable: true });
        if (hold) return;
        const response = (await handle(request))!;
        const blob = await response.blob();
        this.status = response.status;
        this.statusText = response.statusText;
        this.response = blob;
        this.answered = response.headers;
        this.onprogress?.({ loaded: blob.size, total: 0, lengthComputable: false });
        this.onload?.();
      })();
    }
  }
  return { FakeXhr, made };
}

describe('criterion 24: progress, up then down, and null at the end', () => {
  it('a multipart call goes out by XMLHttpRequest, its upload and download told', async () => {
    const { call, handle } = pair({ args: { avatar: 'file' }, files: true, returns: 'str', sig: 'abc123' }, (ctx) => `got ${ctx.args.avatar.name}`);
    const { FakeXhr, made } = fakeXhr(handle);
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const seen: (Progress | null)[] = [];
    await expect(call({ avatar: png() }, { onProgress: (p: Progress | null) => seen.push(p) })).resolves.toBe('got yo.png');
    expect(made).toHaveLength(1);
    expect(made[0].method).toBe('PUT');
    // The headers of the call go on the XMLHttpRequest: the signature among them.
    expect(made[0].headers.get('fud-sig')).toBe('abc123');
    expect(seen.map((p) => p?.phase ?? null)).toEqual(['up', 'up', 'down', null]);
    expect(seen[1]).toMatchObject({ loaded: seen[1]!.total });
    expect(seen[2]!.total).toBeNull();
  });

  it('a 204 by XMLHttpRequest has no body; a network error rejects', async () => {
    const { call, handle } = pair({ args: { avatar: 'file' }, files: true }, () => undefined);
    vi.stubGlobal('XMLHttpRequest', fakeXhr(handle).FakeXhr);
    await expect(call({ avatar: png() })).resolves.toBeUndefined();
    const failing = fakeXhr(handle, { hold: true });
    vi.stubGlobal('XMLHttpRequest', failing.FakeXhr);
    const pending = call({ avatar: png() });
    await vi.waitFor(() => expect(failing.made).toHaveLength(1));
    failing.made[0].onerror();
    await expect(pending).rejects.toThrow('network error');
  });

  it('any other call goes by fetch, its download counted against content-length', async () => {
    const { call } = pair({ method: 'GET', returns: 'file' }, () => new File(['0123456789'], 'f.txt'));
    const seen: (Progress | null)[] = [];
    await call(undefined, { onProgress: (p: Progress | null) => seen.push(p) });
    expect(seen.at(-1)).toBeNull();
    expect(seen.filter((p) => p !== null).at(-1)).toEqual({ loaded: 10, total: 10, phase: 'down' });
  });

  it('without content-length the total is unknown; nobody listening, nothing counted', async () => {
    const { call } = pair({ method: 'GET', returns: 'str' }, () => 'x');
    const seen: (Progress | null)[] = [];
    await call(undefined, { onProgress: (p: Progress | null) => seen.push(p) });
    expect(seen.filter((p) => p !== null).every((p) => p!.total === null)).toBe(true);
    await expect(call()).resolves.toBe('x');
  });

  it('null even when the call fails', async () => {
    const { call } = pair({ method: 'GET', returns: 'str' }, () => {
      throw new HttpError({ status: 500, title: 'Boom' });
    });
    const seen: (Progress | null)[] = [];
    await expect(call(undefined, { onProgress: (p: Progress | null) => seen.push(p) })).rejects.toThrow(HttpError);
    expect(seen.at(-1)).toBeNull();
  });

  it('without XMLHttpRequest (a test, a worker), a multipart call goes by fetch', async () => {
    const { call, seen } = pair({ args: { avatar: 'file' }, files: true }, () => undefined);
    await call({ avatar: png() });
    expect(seen[0]!.headers.get('content-type')).toMatch(/^multipart/u);
  });
});

describe('criterion 25: cancelling half-way', () => {
  it('the signal aborts the XMLHttpRequest, and the call rejects with its reason', async () => {
    const { call, handle } = pair({ args: { avatar: 'file' }, files: true }, () => undefined);
    const held = fakeXhr(handle, { hold: true });
    vi.stubGlobal('XMLHttpRequest', held.FakeXhr);
    const controller = new AbortController();
    const pending = call({ avatar: png() }, { signal: controller.signal });
    await vi.waitFor(() => expect(held.made).toHaveLength(1));
    controller.abort(new DOMException('stop', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(held.made[0].aborted).toBe(true);
  });

  it('a signal aborted before it goes out never opens a request', async () => {
    const { call, handle } = pair({ args: { avatar: 'file' }, files: true }, () => undefined);
    const { FakeXhr, made } = fakeXhr(handle);
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const controller = new AbortController();
    controller.abort(new DOMException('early', 'AbortError'));
    await expect(call({ avatar: png() }, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(made.every((x: { aborted: boolean }) => !x.aborted)).toBe(true);
  });

  it('the server releases its spool when the response is cancelled, or the upload breaks', async () => {
    const release = vi.fn(async () => undefined);
    const spool = (): Spool => ({ ...memorySpool(), release });
    const { handle, url } = pair({ args: { avatar: 'file' }, files: true, returns: 'file' }, (ctx) => ctx.args.avatar, { spool });
    const { body, headers } = multipart([
      { name: '$args', type: 'application/fud+bin', body: '' },
      { name: 'avatar', filename: 'a.bin', body: 'x'.repeat(1000) },
    ]);
    const response = (await handle(new Request(url, { method: 'PUT', body, headers })))!;
    expect(release).not.toHaveBeenCalled();
    await response.body!.cancel();
    expect(release).toHaveBeenCalledOnce();

    // The browser goes away mid-upload: the body breaks, the call ends in a problem, and it is released.
    release.mockClear();
    const broken = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('--b\r\ncontent-disposition: form-data; name="$args"\r\ncontent-type: application/fud+bin\r\n\r\n\r\n--b\r\ncontent-disposition: form-data; name="avatar"; filename="a"\r\n\r\nxxxx'));
        controller.error(new Error('the browser went away'));
      },
    });
    const failed = (await handle(new Request(url, { method: 'PUT', body: broken, headers: { 'content-type': 'multipart/form-data; boundary=b' }, duplex: 'half' } as RequestInit)))!;
    expect(failed.status).toBe(500);
    await failed.arrayBuffer();
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('releasing', () => {
  it('a response with no body releases at once; one read to its end, once; one that fails, too', async () => {
    const release = vi.fn(async () => undefined);
    const spool: Spool = { put: memorySpool().put, release };
    releasing(new Response(null, { status: 204 }), spool);
    expect(release).toHaveBeenCalledOnce();

    release.mockClear();
    const out = releasing(new Response('abc', { status: 201, headers: { 'x-a': '1' } }), spool);
    expect(out.status).toBe(201);
    expect(out.headers.get('x-a')).toBe('1');
    expect(await out.text()).toBe('abc');
    expect(release).toHaveBeenCalledOnce();

    release.mockClear();
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error('broken'));
      },
    });
    const broken = releasing(new Response(failing), spool);
    await expect(broken.text()).rejects.toThrow('broken');
    // A cancel after the failure does not release twice.
    await broken.body?.cancel().catch(() => undefined);
    expect(release).toHaveBeenCalledOnce();
  });

  it('a response cancelled while a read is in flight releases once', async () => {
    const release = vi.fn(async () => undefined);
    let finish: (() => void) | undefined;
    const slow = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      pull: () => new Promise<void>((resolve) => (finish = resolve)),
    });
    const out = releasing(new Response(slow), { put: memorySpool().put, release });
    const reader = out.body!.getReader();
    await reader.read();
    const pending = reader.read();
    // The wrapper's pull is waiting on the body when the cancel comes: both would release.
    await new Promise((r) => setTimeout(r, 10));
    await reader.cancel('gone');
    finish?.();
    await pending.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 10));
    expect(release).toHaveBeenCalledOnce();
  });
});

describe('the corners of the client', () => {
  it('a value whose response says no content type is read in the function’s format', async () => {
    const { call } = pair({ method: 'GET', returns: 'str' }, () => undefined);
    vi.stubGlobal('fetch', async () => new Response(binWire.encodeValue('str', 'plain') as Uint8Array<ArrayBuffer>));
    await expect(call()).resolves.toBe('plain');
  });

  it('-> file? with a file, and -> a list that is not a file', async () => {
    const opt = pair({ method: 'GET', returns: { opt: 'file' } }, () => png('o.png'));
    expect(((await opt.call()) as File).name).toBe('o.png');
    const list = pair({ method: 'GET', returns: { list: 'str' } }, () => ['a', 'b']);
    await expect(list.call()).resolves.toEqual(['a', 'b']);
  });

  it('a file whose response says neither its type nor its date', async () => {
    const { call } = pair({ method: 'GET', returns: 'file' }, () => undefined);
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array([1, 2, 3])));
    const got = (await call()) as File;
    expect(got.type).toBe('');
    expect(got.size).toBe(3);
  });

  it('a multipart value with a text part besides its files: the text part is not a file', async () => {
    const Doc: Ty = { fields: () => ({ title: 'str', adjunto: 'file' }) };
    const { call } = pair({ method: 'GET', returns: Doc }, () => undefined);
    const form = new FormData();
    form.append('$value', new Blob([binWire.encodeValue(Doc, { title: 'T' }) as BlobPart], { type: binWire.type }));
    form.append('note', 'a text part');
    form.append('adjunto', png('a.png'));
    vi.stubGlobal('fetch', async () => new Response(form));
    const got = await call();
    expect(got.adjunto.name).toBe('a.png');
  });

  it('a function that may carry files and takes no other argument: an empty $args', async () => {
    const { call, seen } = pair({ files: true }, () => undefined);
    await call();
    const [args] = await partsOf(seen[0]!);
    expect(args).toMatchObject({ name: '$args', text: '' });
  });

  it('called without arguments, and with a form whose value carries the file', async () => {
    let got: any;
    const { call, spec } = pair({ args: { cover: { opt: 'file' } }, files: true }, (ctx) => void (got = ctx.args));
    await call();
    expect(got).toEqual({});
    // The browser half of a `form:=` call: the value sent is the form's. (The file controls of a
    // form are phase 5's; the server here takes the same arguments without one.)
    const form = { $validate: async () => true, $schema: {}, $value: () => ({ cover: png('f.png') }) };
    const withForm = stub<never, any, any>({ ...spec, form: form as never }) as unknown as (a: unknown) => Promise<unknown>;
    await withForm(form);
    expect(got.cover.name).toBe('f.png');
  });

  it('XMLHttpRequest: an upload whose size is unknown, a download whose size is known', async () => {
    const { call, handle } = pair({ args: { avatar: 'file' }, files: true, returns: 'str' }, () => 'ok');
    const { FakeXhr } = fakeXhr(handle);
    class Sized extends FakeXhr {
      override send(body: FormData): void {
        const up = this.upload.onprogress;
        const down = this.onprogress;
        this.upload.onprogress = (e: any) => up?.({ ...e, lengthComputable: false });
        this.onprogress = (e: any) => down?.({ ...e, total: e.loaded, lengthComputable: true });
        super.send(body);
      }
    }
    vi.stubGlobal('XMLHttpRequest', Sized);
    const seen: (Progress | null)[] = [];
    await call({ avatar: png() }, { onProgress: (p: Progress | null) => seen.push(p) });
    expect(seen[0]).toMatchObject({ phase: 'up', total: null });
    expect(seen[2]).toMatchObject({ phase: 'down' });
    expect(seen[2]!.total).toBe(seen[2]!.loaded);
  });

  it('XMLHttpRequest aborted by something other than the signal: an AbortError of its own', async () => {
    const { call, handle } = pair({ args: { avatar: 'file' }, files: true }, () => undefined);
    const held = fakeXhr(handle, { hold: true });
    vi.stubGlobal('XMLHttpRequest', held.FakeXhr);
    const pending = call({ avatar: png() });
    await vi.waitFor(() => expect(held.made).toHaveLength(1));
    held.made[0].abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError', message: 'The call was cancelled.' });
  });

  it('send without a method posts', async () => {
    const { send } = await import('../../src/client/send.js');
    const { FakeXhr, made } = fakeXhr(async () => new Response('ok'));
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
    const response = await send(new URL(`${ORIGIN}/x`), { body: new FormData(), signal: new AbortController().signal }, undefined);
    expect(await response.text()).toBe('ok');
    expect(made[0].method).toBe('POST');
  });
});

describe('the corners of the wire', () => {
  it('a Blob that carries a name becomes a File of that name; anything else in a file slot is refused', async () => {
    const { conform } = await import('../../src/contract/wire.js');
    const named = Object.assign(new Blob(['x'], { type: 'text/plain' }), { name: 'n.txt' });
    const got = conform('file', named, 'avatar') as File;
    expect(got).toBeInstanceOf(File);
    expect(got.name).toBe('n.txt');
    expect(() => conform('file', 'not a file', 'avatar')).toThrow(/avatar/u);
  });

  it('an optional type that carries a file: split, joined and a slot through it', async () => {
    const { splitValue, joinValue, fileSlotAt } = await import('../../src/wire/files.js');
    const Doc: Ty = { fields: () => ({ title: 'str', adjunto: 'file' }) };
    const adj = png('adj.png');
    const { rest, files } = splitValue({ opt: Doc }, { title: 'T', adjunto: adj });
    expect(files).toEqual([['adjunto', adj]]);
    expect(joinValue({ opt: Doc }, rest, new Map(files))).toEqual({ title: 'T', adjunto: adj });
    expect(fileSlotAt({ doc: { opt: Doc } }, 'doc.adjunto')).toBe(true);
  });
});

describe('the corners of the server', () => {
  it('a file part without a filename is a file without a name', async () => {
    let got: File | undefined;
    const { handle, url } = pair({ args: { avatar: 'file' }, files: true }, (ctx) => void (got = ctx.args.avatar));
    const { body, headers } = multipart([
      { name: '$args', type: 'application/fud+bin', body: '' },
      { name: 'avatar', body: 'bytes' },
    ]);
    expect((await handle(new Request(url, { method: 'PUT', body, headers })))!.status).toBe(204);
    expect(got!.name).toBe('');
    expect(await got!.text()).toBe('bytes');
  });
});
