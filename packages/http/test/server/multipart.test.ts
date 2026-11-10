/**
 * SDD-81 §4.4: the multipart reader — parts out of a stream as it arrives, a boundary cut across
 * any chunk, the headers of a part, and every malformed body a `400 multipart body: …`.
 */

import { describe, expect, it } from 'vitest';
import { HttpError } from '../../src/errors.js';
import { boundaryOf, readParts } from '../../src/server/multipart.js';

const utf8 = new TextEncoder();
const B = 'XyZ-boundary';

/** `bytes` as a stream of chunks of `size` (all at once by default). */
function streamOf(bytes: Uint8Array, size = bytes.length || 1): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(at, at + size));
      at += size;
    },
  });
}

/** A body with `parts`, each `[headers, body]`, as a browser writes it. */
function body(parts: readonly (readonly [string, string | Uint8Array])[], { preamble = '', epilogue = '' } = {}): Uint8Array {
  const chunks: Uint8Array[] = [utf8.encode(preamble)];
  for (const [headers, content] of parts) {
    chunks.push(utf8.encode(`--${B}\r\n${headers}\r\n\r\n`));
    chunks.push(typeof content === 'string' ? utf8.encode(content) : content);
    chunks.push(utf8.encode('\r\n'));
  }
  chunks.push(utf8.encode(`--${B}--\r\n${epilogue}`));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** Every part, its body read. */
async function read(stream: ReadableStream<Uint8Array>, boundary = B) {
  const out: { name: string; filename?: string; type: string; text: string }[] = [];
  for await (const part of readParts(stream, boundary)) {
    const { body: b, ...head } = part;
    out.push({ ...head, text: await new Response(b).text() });
  }
  return out;
}

/** The detail of the 400 `stream` ends in. */
async function refusal(stream: ReadableStream<Uint8Array>, boundary = B): Promise<string> {
  try {
    await read(stream, boundary);
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).status).toBe(400);
    return (error as HttpError).problem.detail ?? '';
  }
  return expect.unreachable('no refusal');
}

const ARGS = 'content-disposition: form-data; name="$args"\r\ncontent-type: application/json';

describe('boundaryOf', () => {
  it('the boundary of multipart/form-data, quoted or not, any case, 1 to 70 characters', () => {
    expect(boundaryOf(`multipart/form-data; boundary=${B}`)).toBe(B);
    expect(boundaryOf('Multipart/Form-Data; charset=utf-8; boundary="a b\\"c"')).toBe('a b"c');
    expect(boundaryOf(`multipart/form-data; boundary=${'x'.repeat(70)}`)).toBe('x'.repeat(70));
  });

  it('nothing for another type, no boundary, an empty or too long one, or no header', () => {
    expect(boundaryOf(null)).toBeUndefined();
    expect(boundaryOf('application/json')).toBeUndefined();
    expect(boundaryOf('multipart/form-data')).toBeUndefined();
    expect(boundaryOf('multipart/form-data; boundary=')).toBeUndefined();
    expect(boundaryOf(`multipart/form-data; boundary=${'x'.repeat(71)}`)).toBeUndefined();
    expect(boundaryOf('multipart/form-data; junk; boundary=b')).toBeUndefined();
  });
});

describe('readParts', () => {
  const PARTS = [
    [ARGS, '{"name":"Ana"}'],
    ['content-disposition: form-data; name="avatar"; filename="yo.png"\r\ncontent-type: image/png', 'PNGBYTES'],
    ['Content-Disposition: form-data; name="fotos.0"; filename*=UTF-8\'\'n%C3%BAmero.png; filename="numero.png"', 'second'],
    ['content-disposition: form-data; name="empty"; filename=""', ''],
  ] as const;
  const EXPECTED = [
    { name: '$args', type: 'application/json', text: '{"name":"Ana"}' },
    { name: 'avatar', filename: 'yo.png', type: 'image/png', text: 'PNGBYTES' },
    { name: 'fotos.0', filename: 'número.png', type: 'text/plain', text: 'second' },
    { name: 'empty', filename: '', type: 'text/plain', text: '' },
  ];

  it('the parts in order, with their names, file names (filename* in UTF-8 first) and types', async () => {
    expect(await read(streamOf(body(PARTS)))).toEqual(EXPECTED);
  });

  it('the same whatever the chunks: one byte at a time, or cut anywhere', async () => {
    const bytes = body(PARTS, { preamble: 'ignored preamble\r\n', epilogue: 'ignored epilogue' });
    for (const size of [1, 2, 3, 7, 13, 64]) expect(await read(streamOf(bytes, size)), String(size)).toEqual(EXPECTED);
  });

  it('a body that contains almost-boundaries and CRLFs is not cut there', async () => {
    // Pieces of the delimiter, never `CRLF--boundary` whole: that one a sender never writes in a body.
    const tricky = `a\r\n--${B.slice(0, -1)}\r\n\r\n-${B}x --${B}`;
    const bytes = body([[ARGS, tricky]]);
    for (const size of [1, 5, 1000]) expect((await read(streamOf(bytes, size)))[0]!.text).toBe(tricky);
  });

  it('binary bytes come out untouched', async () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 37) % 256);
    const parts = [];
    for await (const part of readParts(streamOf(body([['content-disposition: form-data; name="f"; filename="b"', bytes]]), 17), B)) {
      parts.push(new Uint8Array(await new Response(part.body).arrayBuffer()));
    }
    expect(parts[0]).toEqual(bytes);
  });

  it('a part whose body nobody read is skipped when the next one is asked', async () => {
    const names: string[] = [];
    for await (const part of readParts(streamOf(body(PARTS), 3), B)) names.push(part.name);
    expect(names).toEqual(['$args', 'avatar', 'fotos.0', 'empty']);
  });

  it('a boundary padded with spaces before its line break, and a body with no parts', async () => {
    const padded = utf8.encode(`--${B} \t\r\n${ARGS}\r\n\r\n{}\r\n--${B}--`);
    expect(await read(streamOf(padded, 4))).toEqual([{ name: '$args', type: 'application/json', text: '{}' }]);
    expect(await read(streamOf(utf8.encode(`--${B}--\r\n`)))).toEqual([]);
  });

  it('a filename* that does not decode falls back to filename; one of another charset too', async () => {
    const bad = body([['content-disposition: form-data; name="a"; filename*=UTF-8\'\'%E0%A4%A; filename="plain.txt"', 'x']]);
    expect((await read(streamOf(bad)))[0]!.filename).toBe('plain.txt');
    const latin = body([['content-disposition: form-data; name="a"; filename*=iso-8859-1\'\'x', 'x']]);
    expect((await read(streamOf(latin)))[0]).not.toHaveProperty('filename');
  });
});

describe('the corners of the reader', () => {
  it('a parameter without = ends the parameters', () => {
    expect(boundaryOf(`multipart/form-data; boundary=${B}; flag`)).toBe(B);
  });

  it('a part with other headers besides its own', async () => {
    const parts = await read(streamOf(body([['content-disposition: form-data; name="a"\r\ncontent-length: 1\r\ncontent-type: text/csv', 'x']])));
    expect(parts).toEqual([{ name: 'a', type: 'text/csv', text: 'x' }]);
  });

  it('a body that ends right after a boundary', async () => {
    expect(await refusal(streamOf(utf8.encode(`--${B}`)))).toBe('multipart body: a boundary not followed by a line break');
  });

  it('a content-disposition with no type before its parameters', async () => {
    expect(await refusal(streamOf(body([['content-disposition: ; name="a"', 'x']])))).toBe('multipart body: a part that is not form-data ()');
  });
});

describe('every malformed body is a 400 multipart body: …', () => {
  it('no boundary at all', async () => {
    expect(await refusal(streamOf(utf8.encode('just some text')))).toBe('multipart body: no boundary');
    expect(await refusal(streamOf(new Uint8Array(0)))).toBe('multipart body: no boundary');
  });

  it('a boundary followed by something that is not a line break', async () => {
    expect(await refusal(streamOf(utf8.encode(`--${B}xx`)))).toBe('multipart body: a boundary not followed by a line break');
  });

  it('a body that ends inside the headers, or inside a part', async () => {
    expect(await refusal(streamOf(utf8.encode(`--${B}\r\ncontent-disposition: form-data; name="a"`)))).toBe(
      'multipart body: the body ends inside the headers of a part',
    );
    expect(await refusal(streamOf(utf8.encode(`--${B}\r\n${ARGS}\r\n\r\n{"unfinished`)))).toBe('multipart body: the body ends inside a part');
  });

  it('a header line without a colon, a part without content-disposition, one that is not form-data, one without a name', async () => {
    expect(await refusal(streamOf(body([['no colon here', 'x']])))).toBe('multipart body: a header line without a colon');
    expect(await refusal(streamOf(body([['content-type: text/plain', 'x']])))).toBe('multipart body: a part without content-disposition');
    expect(await refusal(streamOf(body([['content-disposition: attachment; name="a"', 'x']])))).toBe(
      'multipart body: a part that is not form-data (attachment)',
    );
    expect(await refusal(streamOf(body([['content-disposition: form-data; filename="a"', 'x']])))).toBe('multipart body: a part without a name');
  });

  it('a header block longer than 16 KB, whether it ends or not', async () => {
    const long = `content-disposition: form-data; name="a"\r\nx-pad: ${'p'.repeat(17 * 1024)}`;
    expect(await refusal(streamOf(body([[long, 'x']])))).toBe('multipart body: a header block too long');
    expect(await refusal(streamOf(body([[long, 'x']]), 1024))).toBe('multipart body: a header block too long');
  });
});
