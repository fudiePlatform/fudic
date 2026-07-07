import { type RenderMessage } from '../src/messages.js';

/** Resolve with the next message on the port (and unhook). */
export function firstMessage(port: MessagePort): Promise<RenderMessage> {
  return new Promise((resolve) => {
    port.onmessage = (e: MessageEvent): void => {
      port.onmessage = null;
      resolve(e.data as RenderMessage);
    };
  });
}

/** Drain a byte stream and decode it as UTF-8 text. */
export async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    text += decoder.decode(value, { stream: true });
  }
}
