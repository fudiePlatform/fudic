import { afterEach, describe, expect, it, vi } from 'vitest';
import { htmlToByteStream } from '@fudic/ssr';
import {
  type RenderChunk,
  type RenderRequest,
  type RouteManifest,
  serveRender,
  installRenderWorker,
  receiveRender,
} from '../src/index.js';
import { firstMessage, readAll } from './helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

const req = (route: string): RenderRequest => ({ type: 'render', reqId: 'req-t', route });

describe('serveRender (SDD-16 §6.9)', () => {
  it('runs the injected chunk and posts its render to the port', async () => {
    const chunk: RenderChunk = () => htmlToByteStream(['<p>hi</p>']);
    const { port1, port2 } = new MessageChannel();
    const arriving = firstMessage(port2);
    await serveRender(port1, req('/hi'), () => Promise.resolve(chunk));
    expect(await readAll(receiveRender(port2, await arriving))).toBe('<p>hi</p>');
    port1.close();
    port2.close();
  });

  it('a rejecting resolveChunk posts end (empty stream) and does not throw', async () => {
    const { port1, port2 } = new MessageChannel();
    const arriving = firstMessage(port2);
    await expect(
      serveRender(port1, req('/missing'), () => Promise.reject(new Error('unknown route'))),
    ).resolves.toBeUndefined();
    const first = await arriving;
    expect(first.type).toBe('end');
    expect(await readAll(receiveRender(port2, first))).toBe('');
    port1.close();
    port2.close();
  });
});

describe('installRenderWorker (SDD-16 §4.6)', () => {
  const CHUNK_MODULE =
    'data:text/javascript,' +
    encodeURIComponent(
      'export default () => new ReadableStream({ start(c) {' +
        "c.enqueue(new TextEncoder().encode('<p>dyn</p>')); c.close();" +
        '} });',
    );

  function manifestOf(routes: Record<string, string>): RouteManifest {
    return {
      match(route) {
        const chunk = routes[route];
        return chunk === undefined ? null : { dynamic: true, chunk };
      },
    };
  }

  function install(manifest: RouteManifest): (e: MessageEvent) => void {
    const scope: { onmessage: ((e: MessageEvent) => void) | null } = { onmessage: null };
    vi.stubGlobal('self', scope);
    installRenderWorker(manifest);
    const handler = scope.onmessage;
    if (handler === null) {
      throw new Error('installRenderWorker did not wire self.onmessage');
    }
    return handler;
  }

  it('wires self.onmessage and serves a chunk resolved via the manifest', async () => {
    const handler = install(manifestOf({ '/dyn': CHUNK_MODULE }));
    const { port1, port2 } = new MessageChannel();
    const arriving = firstMessage(port2);
    handler({ data: req('/dyn'), ports: [port1] } as unknown as MessageEvent);
    expect(await readAll(receiveRender(port2, await arriving))).toBe('<p>dyn</p>');
    port1.close();
    port2.close();
  });

  it('an unmatched route ends the render empty (the SW never hangs)', async () => {
    const handler = install(manifestOf({}));
    const { port1, port2 } = new MessageChannel();
    const arriving = firstMessage(port2);
    handler({ data: req('/nowhere'), ports: [port1] } as unknown as MessageEvent);
    expect((await arriving).type).toBe('end');
    port1.close();
    port2.close();
  });

  it('a message without a reply port is ignored', () => {
    const handler = install(manifestOf({}));
    expect(() => {
      handler({ data: req('/x'), ports: [] } as unknown as MessageEvent);
    }).not.toThrow();
  });
});
