import { afterEach, describe, expect, it, vi } from 'vitest';
import { SsrDom, renderToStream, renderToString, htmlToByteStream } from '@fudic/ssr';
import { canTransferStream, sendRender, receiveRender } from '../src/index.js';
import { firstMessage, readAll } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function multiChunkTree(d: SsrDom) {
  const div = d.element('div');
  d.append(div, d.text('a<b'));
  d.append(div, d.element('img'));
  const style = d.element('style');
  d.append(style, d.text('.x{}'));
  d.append(div, style);
  return div;
}

describe('canTransferStream (SDD-16 §6.7)', () => {
  it('returns true where ReadableStream transfer is supported (Node)', () => {
    expect(canTransferStream()).toBe(true);
  });

  it('returns false, without throwing, where the transfer throws', () => {
    vi.stubGlobal('structuredClone', () => {
      throw new Error('DataCloneError');
    });
    expect(canTransferStream()).toBe(false);
  });
});

describe('transport adapter roundtrip (SDD-16 §6.8)', () => {
  it('native path: the stream is transferred whole and arrives intact', async () => {
    const d = new SsrDom();
    const tree = multiChunkTree(d);
    const { port1, port2 } = new MessageChannel();
    sendRender(port1, renderToStream(tree, { highWaterMark: 16 }), true);
    const first = await firstMessage(port2);
    expect(first.type).toBe('stream');
    expect(await readAll(receiveRender(port2, first))).toBe(renderToString(tree));
    port1.close();
    port2.close();
  });

  it('degraded path: chunk fan-out reassembles to the same content', async () => {
    const d = new SsrDom();
    const tree = multiChunkTree(d);
    const { port1, port2 } = new MessageChannel();
    sendRender(port1, renderToStream(tree, { highWaterMark: 16 }), false);
    const first = await firstMessage(port2);
    expect(first.type).toBe('chunk'); // more than one message: chunk(s) then end
    expect(await readAll(receiveRender(port2, first))).toBe(renderToString(tree));
    port1.close();
    port2.close();
  });

  it('degraded path: an empty stream arrives as a bare end (empty content)', async () => {
    const { port1, port2 } = new MessageChannel();
    sendRender(port1, htmlToByteStream([]), false);
    const first = await firstMessage(port2);
    expect(first.type).toBe('end');
    expect(await readAll(receiveRender(port2, first))).toBe('');
    port1.close();
    port2.close();
  });

  it('degraded path: a failing source still terminates the protocol with end', async () => {
    // Erroring discards the queue (stream semantics), so the protocol closes empty.
    const broken = new ReadableStream<Uint8Array>({
      start(controller): void {
        controller.error(new Error('boom'));
      },
    });
    const { port1, port2 } = new MessageChannel();
    sendRender(port1, broken, false);
    const first = await firstMessage(port2);
    expect(first.type).toBe('end');
    expect(await readAll(receiveRender(port2, first))).toBe('');
    port1.close();
    port2.close();
  });
});
