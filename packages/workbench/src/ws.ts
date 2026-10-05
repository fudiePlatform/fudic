/**
 * The smallest WebSocket the workbench needs (RFC 6455): the opening handshake and unfragmented
 * text frames from server to client. The shell sends nothing back, so there is no frame reader.
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

/** FIN + text opcode. */
const TEXT = 0x81;

/** One unmasked, unfragmented text frame, with a 7-, 16- or 64-bit payload length. */
export function textFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8');
  const length = payload.length;
  let head: Buffer;
  if (length < 126) {
    head = Buffer.from([TEXT, length]);
  } else if (length < 0x10000) {
    head = Buffer.alloc(4);
    head[0] = TEXT;
    head[1] = 126;
    head.writeUInt16BE(length, 2);
  } else {
    head = Buffer.alloc(10);
    head[0] = TEXT;
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(length), 2);
  }
  return Buffer.concat([head, payload]);
}
