import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { acceptKey, closeFrame, FrameReader, handshake, pongFrame, textFrame, UNSUPPORTED } from '../src/ws.js';

describe('acceptKey', () => {
  it('answers the RFC 6455 §1.3 example', () => {
    expect(acceptKey('dGhlIHNhbXBsZSBub25jZQ==')).toBe('s3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  });
});

describe('handshake', () => {
  it('is the 101 that opens the socket', () => {
    expect(handshake('dGhlIHNhbXBsZSBub25jZQ==')).toBe(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        'Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n\r\n',
    );
  });
});

/** Reads one unmasked server frame back: FIN, opcode, length and payload. */
function read(frame: Buffer): { fin: boolean; opcode: number; masked: boolean; text: string; head: number } {
  const first = frame[0]!;
  const second = frame[1]!;
  const short = second & 0x7f;
  let length: number;
  let head: number;
  if (short === 126) {
    length = frame.readUInt16BE(2);
    head = 4;
  } else if (short === 127) {
    length = Number(frame.readBigUInt64BE(2));
    head = 10;
  } else {
    length = short;
    head = 2;
  }
  expect(frame.length).toBe(head + length);
  return {
    fin: (first & 0x80) !== 0,
    opcode: first & 0x0f,
    masked: (second & 0x80) !== 0,
    text: frame.subarray(head).toString('utf8'),
    head,
  };
}

describe('textFrame', () => {
  it.each([
    [0, 2],
    [125, 2],
    [126, 4],
    [65535, 4],
    [65536, 10],
  ])('frames %i bytes with a %i-byte head', (bytes, head) => {
    const text = 'a'.repeat(bytes);
    const frame = read(textFrame(text));
    expect(frame).toEqual({ fin: true, opcode: 1, masked: false, text, head });
  });

  it('measures the length in UTF-8 bytes, not in characters', () => {
    // 42 × 3 bytes = 126: a 7-bit length if it counted characters, a 16-bit one in bytes.
    const text = '€'.repeat(42);
    const frame = textFrame(text);
    expect(frame[1]).toBe(126);
    expect(frame.readUInt16BE(2)).toBe(126);
    expect(read(frame).text).toBe(text);
    expect(read(textFrame('ñ😀')).text).toBe('ñ😀');
  });

  it('frames a close with its code, and a pong with its payload', () => {
    expect([...closeFrame(UNSUPPORTED)]).toEqual([0x88, 2, 0x03, 0xeb]);
    expect([...pongFrame(Buffer.from('ok'))]).toEqual([0x8a, 2, 0x6f, 0x6b]);
  });

  it('is what a hash of the payload says it is', () => {
    const text = JSON.stringify({ v: 1, type: 'problem', message: 'x'.repeat(70000) });
    const payload = textFrame(text).subarray(10);
    expect(createHash('sha1').update(payload).digest('hex')).toBe(
      createHash('sha1').update(text, 'utf8').digest('hex'),
    );
  });
});

const MASK = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);

/** A frame as a browser sends it: masked, with the length in 7, 16 or 64 bits. */
function client(opcode: number, payload: Buffer, { fin = true, masked = true } = {}): Buffer {
  const length = payload.length;
  let head: Buffer;
  if (length < 126) head = Buffer.from([0, length]);
  else if (length < 0x10000) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(length, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(length), 2);
  }
  head[0] = (fin ? 0x80 : 0) | opcode;
  if (!masked) return Buffer.concat([head, payload]);
  head[1] = head[1]! | 0x80;
  return Buffer.concat([head, MASK, Buffer.from(payload.map((b, i) => b ^ MASK[i % 4]!))]);
}

describe('FrameReader — criterion 11', () => {
  it('reads masked text frames of every length size, two in one chunk', () => {
    const reader = new FrameReader();
    const long = 'a'.repeat(300);
    const huge = 'b'.repeat(70_000);
    expect(reader.push(Buffer.concat([client(1, Buffer.from('{"v":2}')), client(1, Buffer.from(long))]))).toEqual([
      { type: 'text', text: '{"v":2}' },
      { type: 'text', text: long },
    ]);
    expect(reader.push(client(1, Buffer.from(huge)))).toEqual([{ type: 'text', text: huge }]);
  });

  it('waits for a frame cut across chunks, at every point of its head and body', () => {
    for (const payload of [Buffer.from('hello'), Buffer.from('c'.repeat(200)), Buffer.from('d'.repeat(70_000))]) {
      const bytes = client(1, payload);
      for (const cut of [1, 3, 9, 12, bytes.length - 1].filter((c) => c < bytes.length)) {
        const reader = new FrameReader();
        expect(reader.push(bytes.subarray(0, cut))).toEqual([]);
        expect(reader.push(bytes.subarray(cut))).toEqual([{ type: 'text', text: payload.toString() }]);
      }
    }
  });

  it('reads a close with its code, a close without one as 1005, and a ping with its payload', () => {
    const reader = new FrameReader();
    expect(reader.push(client(8, Buffer.from([0x03, 0xe8])))).toEqual([{ type: 'close', code: 1000 }]);
    expect(reader.push(client(8, Buffer.alloc(0)))).toEqual([{ type: 'close', code: 1005 }]);
    expect(reader.push(client(9, Buffer.from('p')))).toEqual([{ type: 'ping', payload: Buffer.from('p') }]);
  });

  it.each([
    ['a binary frame', client(2, Buffer.from([1]))],
    ['a pong', client(10, Buffer.alloc(0))],
    ['an unmasked frame', client(1, Buffer.from('x'), { masked: false })],
    ['a fragment', client(1, Buffer.from('x'), { fin: false })],
  ])('answers unsupported for %s, and reads nothing after it', (_name, bytes) => {
    const reader = new FrameReader();
    expect(reader.push(Buffer.concat([bytes, client(1, Buffer.from('later'))]))).toEqual([{ type: 'unsupported' }]);
    expect(reader.push(client(1, Buffer.from('more')))).toEqual([]);
  });
});
