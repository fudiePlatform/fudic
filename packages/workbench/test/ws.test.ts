import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { acceptKey, handshake, textFrame } from '../src/ws.js';

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

  it('is what a hash of the payload says it is', () => {
    const text = JSON.stringify({ v: 1, type: 'problem', message: 'x'.repeat(70000) });
    const payload = textFrame(text).subarray(10);
    expect(createHash('sha1').update(payload).digest('hex')).toBe(
      createHash('sha1').update(text, 'utf8').digest('hex'),
    );
  });
});
