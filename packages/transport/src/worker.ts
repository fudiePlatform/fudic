/**
 * The Web Worker side: a local render server (SDD-16 §4.6). It runs the SAME
 * emitted `async function*` an edge worker would — same emit target, zero new
 * compiler targets. It never touches the DOM and never intercepts the network;
 * the impossibility is structural (no DOM API in its contract).
 */

import { type RenderMessage, type RenderRequest } from './messages.js';
import { sendRender } from './adapter.js';
import { type RouteManifest } from './manifest.js';

/** What a view chunk exports: route → HTML byte stream. The emit (SDD-15) produces these. */
export type RenderChunk = (route: string) => ReadableStream<Uint8Array>;

/**
 * Handle one `RenderRequest` over its reply port. `resolveChunk` is injected
 * (DIP) and owns the whole route→module path; tests pass a fake. If it rejects
 * (unknown route, render failure), an empty `{type:'end'}` is posted so the SW
 * never hangs — the error signal belongs to the control channel.
 */
export async function serveRender(
  port: MessagePort,
  req: RenderRequest,
  resolveChunk: (route: string) => Promise<RenderChunk>,
): Promise<void> {
  try {
    const chunk = await resolveChunk(req.route);
    sendRender(port, chunk(req.route));
  } catch {
    port.postMessage({ type: 'end' } satisfies RenderMessage);
  }
}

/**
 * WW bootstrap: build the production `resolveChunk` over the manifest (the
 * other half of the single route source) and wire the message source — each
 * request carries its reply port transferred alongside the `RenderRequest`.
 *
 * `source` is the `MessagePort` the main thread transferred (the SW's end of the
 * channel is the other one); with no port the worker listens on `self`, the plain
 * dedicated-worker wiring.
 */
export function installRenderWorker(manifest: RouteManifest, source?: MessagePort): void {
  const resolveChunk = async (route: string): Promise<RenderChunk> => {
    const entry = manifest.match(route);
    if (entry === null) {
      throw new Error(`No chunk for route: ${route}`);
    }
    const module = (await import(/* @vite-ignore */ entry.chunk)) as { default: RenderChunk };
    return module.default;
  };
  const handle = (e: MessageEvent): void => {
    const port = e.ports[0];
    if (port === undefined) {
      return;
    }
    void serveRender(port, e.data as RenderRequest, resolveChunk);
  };
  if (source !== undefined) {
    source.onmessage = handle;
    source.start(); // a transferred port stays paused until started
    return;
  }
  self.onmessage = handle;
}
