/**
 * The typed message contract of the three-thread shell (SDD-16 §3.2, §4.3).
 * Two disjoint channels, never mixed: data travels over a 1:1 `MessagePort`
 * per request (SW ↔ WW), control signals over a `BroadcastChannel`.
 */

export type ReqId = string;

/** SW → WW: render this route into the reply port of the MessageChannel. */
export interface RenderRequest {
  readonly type: 'render';
  readonly reqId: ReqId;
  readonly route: string; // pathname + search
}

/** WW → SW render payload. Two shapes by capability (the transport adapter picks). */
export type RenderMessage =
  | { readonly type: 'stream'; readonly stream: ReadableStream<Uint8Array> } // native transfer
  | { readonly type: 'chunk'; readonly buffer: ArrayBuffer }                 // degraded fan-out
  | { readonly type: 'end' };                                                // degraded terminator

/**
 * main → WW and main → SW handshake: the transferred `MessagePort` that joins them.
 * A `ServiceWorkerGlobalScope` exposes neither `Worker` nor `import()`, so the Service
 * Worker can neither spawn the render worker nor load a chunk itself — the main thread
 * creates the Web Worker and gives each side one end of a `MessageChannel`.
 */
export const WORKER_PORT_MESSAGE = 'fudic:worker-port';

/** The message that carries that port (the port itself travels in `event.ports[0]`). */
export interface WorkerPortMessage {
  readonly type: typeof WORKER_PORT_MESSAGE;
}

/** Out-of-band control signals; they interest all three threads at once. */
export type ControlMessage =
  | { readonly type: 'invalidate'; readonly route: string }
  | { readonly type: 'version'; readonly build: string }
  | { readonly type: 'purge'; readonly route: string };
