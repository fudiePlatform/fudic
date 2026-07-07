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

/** Out-of-band control signals; they interest all three threads at once. */
export type ControlMessage =
  | { readonly type: 'invalidate'; readonly route: string }
  | { readonly type: 'version'; readonly build: string }
  | { readonly type: 'purge'; readonly route: string };
