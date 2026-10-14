/**
 * The smallest WebSocket the workbench needs (RFC 6455), its own so that neither the shell nor
 * its commands depend on Vite's HMR channel: the opening handshake, unfragmented text frames both
 * ways, `close` answered, `ping` answered with `pong`. Anything else from the client — a binary
 * frame, a fragment, an unmasked frame — closes the socket with 1003.
 */

import { createHash } from 'node:crypto';

/** The fixed GUID every server appends to the client's key (RFC 6455 §1.3). */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** `Sec-WebSocket-Accept` for a client's `Sec-WebSocket-Key`. */
export function acceptKey(key: string): string {
  return createHash('sha1').update(key + GUID).digest('base64');
}

/** The `101` response that opens the socket. */
export function handshake(key: string): string {
  return (
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`
  );
}

const TEXT = 0x1;
const CLOSE = 0x8;
const PING = 0x9;
const PONG = 0xa;
const FIN = 0x80;

/** The close code for data the endpoint cannot accept (RFC 6455 §7.4.1). */
export const UNSUPPORTED = 1003;

/** One unmasked, unfragmented frame, with a 7-, 16- or 64-bit payload length. */
function frame(opcode: number, payload: Buffer): Buffer {
  const length = payload.length;
  let head: Buffer;
  if (length < 126) {
    head = Buffer.from([FIN | opcode, length]);
  } else if (length < 0x10000) {
    head = Buffer.alloc(4);
    head[0] = FIN | opcode;
    head[1] = 126;
    head.writeUInt16BE(length, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = FIN | opcode;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([head, payload]);
}

export function textFrame(text: string): Buffer {
  return frame(TEXT, Buffer.from(text, 'utf8'));
}

/** A `close` with its status code. */
export function closeFrame(code: number): Buffer {
  const payload = Buffer.alloc(2);
  payload.writeUInt16BE(code, 0);
  return frame(CLOSE, payload);
}

export function pongFrame(payload: Buffer): Buffer {
  return frame(PONG, payload);
}

/** What the client sent, frame by frame. */
export type ClientFrame =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'close'; readonly code: number }
  | { readonly type: 'ping'; readonly payload: Buffer }
  | { readonly type: 'unsupported' };

/**
 * Reads the client's frames from the bytes of its socket, which arrive in chunks that do not
 * respect frame boundaries: a frame is answered only once it is whole.
 */
export class FrameReader {
  #buffer = Buffer.alloc(0);
  #failed = false;

  /** The frames completed by this chunk. After `unsupported`, nothing more is read. */
  push(chunk: Buffer): ClientFrame[] {
    if (this.#failed) return [];
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const frames: ClientFrame[] = [];
    for (let next = this.#next(); next !== undefined; next = this.#next()) {
      frames.push(next);
      if (next.type === 'unsupported') {
        this.#failed = true;
        break;
      }
    }
    return frames;
  }

  #next(): ClientFrame | undefined {
    const buffer = this.#buffer;
    if (buffer.length < 2) return undefined;
    const first = buffer[0]!;
    const second = buffer[1]!;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < 4) return undefined;
      length = buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (buffer.length < 10) return undefined;
      length = Number(buffer.readBigUInt64BE(2));
      offset = 10;
    }
    const masked = (second & 0x80) !== 0;
    const end = offset + (masked ? 4 : 0) + length;
    if (buffer.length < end) return undefined;
    this.#buffer = buffer.subarray(end);

    const opcode = first & 0x0f;
    // A client must mask every frame (§5.1), and the shell never fragments a command.
    if (!masked || (first & FIN) === 0) return { type: 'unsupported' };
    const mask = buffer.subarray(offset, offset + 4);
    const payload = Buffer.from(buffer.subarray(offset + 4, end));
    for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i % 4]!;

    if (opcode === TEXT) return { type: 'text', text: payload.toString('utf8') };
    if (opcode === CLOSE) return { type: 'close', code: payload.length >= 2 ? payload.readUInt16BE(0) : 1005 };
    if (opcode === PING) return { type: 'ping', payload };
    return { type: 'unsupported' };
  }
}
