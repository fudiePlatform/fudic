/**
 * The message contract of the client shell (SDD-20 §3.6). With the render living in
 * the Service Worker there is no data channel any more: nothing streams between
 * threads. What is left is a control channel (`BroadcastChannel`, out-of-band) and a
 * single main→SW notice — the ONE warm trigger of SDD-20 §4.6.2.
 */

/** Out-of-band control signals; they interest every thread at once. */
export type ControlMessage =
  | { readonly type: 'invalidate'; readonly route: string }
  | { readonly type: 'version'; readonly build: string }
  | { readonly type: 'purge'; readonly route: string };

/**
 * main → SW: "the user is here". The SINGLE warm trigger (SDD-20 §4.6.2): the
 * prototype had two (`activate` plus a document message) and neither waited for the
 * other, so every chunk was downloaded twice. `activate` does not warm.
 */
export const LOCATION_MESSAGE = 'fudic:here';

export interface LocationMessage {
  readonly type: typeof LOCATION_MESSAGE;
  readonly url: string;
}
