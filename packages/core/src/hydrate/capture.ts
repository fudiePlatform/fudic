/**
 * The capturer: ONE listener, in the CAPTURE phase, and the three paths (SDD-17 §4.2, §4.3).
 *
 * Capture is what makes the decision possible at all: the runtime sees the event BEFORE any
 * listener a component installed (those run on the bubble), so it can decide whether to
 * download before the gesture is lost.
 *
 * The nearest `[data-fud-id]` host is found by walking `composedPath()`, which crosses the
 * shadow boundary — `closest()` does not. With no host, the event is not ours.
 *
 * **Path 1 — the instance is already hydrated.** The runtime withdraws immediately and the
 * component's own listener handles the event with its real `ev`: `stopPropagation` and
 * `preventDefault` behave exactly as in any DOM listener. This is the closure that prevents
 * the double fire — nothing is counted "once", a state is checked and the runtime leaves.
 *
 * **Path 2 — first interaction, tag NOT defined.** There is no own listener and the gesture
 * would be lost. The instance is marked BEFORE any `await` (so a re-entrant dispatch falls
 * into path 1), the half-done gesture is cancelled, and the long path is delegated.
 *
 * **Path 3 — first interaction, tag already defined by another instance.** This instance
 * already got its slice and hooked up when the tag was defined (`attachAll`), so its own
 * listener exists and ALREADY received the original event on the bubble — same propagation,
 * the runtime is merely earlier in it. Mark, report, withdraw: no download, no stop, and NO
 * replay, which here would be a second execution.
 */

import { opensPicker, replayer } from './replay.js';
import { ID_ATTR, idOf, type ElementRegistry, type InstanceState } from './registry.js';

export interface CaptureConfig {
  readonly state: InstanceState;
  readonly registry: ElementRegistry;
  /**
   * Path 2, delegated. The capturer decides WHICH path an event takes; the order
   * bus→cascade→host→replay is the orchestrator's, and that is why this module depends on
   * neither of them.
   */
  readonly onCold: (host: Element, id: number, replay: () => void) => void;
  /** Path 3 — nothing to do but say so. */
  readonly onShared: (host: Element, id: number) => void;
  /**
   * Whether a host listens AROUND its child hosts (`fud-around`, SDD-85 decision 43): an
   * `@event` on an element that is, or holds, one of them. Absent, no host does.
   */
  readonly listensAround?: (host: Element) => boolean;
}

/**
 * The host a gesture raises, and the real target under it.
 *
 * The nearest host of the composed path — unless a host further out listens around it and is
 * not up yet: then the outermost such one, because its listener hears this gesture too and the
 * cascade brings everything under it up first, the nearest host included. Without it a click on
 * a delegated child raised the child and nobody heard it.
 *
 * «Not up yet» includes an owner whose path 2 is IN FLIGHT: the hover that raised it is followed
 * by the click, and that click has to wait in the owner's queue. Sent to the nearest host
 * instead, it was replayed when the child came up, before its owner, and was heard by nobody.
 */
function targeted(
  path: readonly EventTarget[],
  notUp: (id: number) => boolean,
  listensAround: (host: Element) => boolean,
): { host: Element; target: EventTarget } | null {
  const target = path[0];
  if (target === undefined) {
    return null; // an event that is not being dispatched has no path
  }
  let nearest: Element | null = null;
  let around: Element | null = null;
  for (const node of path) {
    if (!(node instanceof Element) || !node.hasAttribute(ID_ATTR)) continue;
    if (nearest === null) nearest = node;
    else if (notUp(idOf(node)) && listensAround(node)) around = node;
  }
  const host = around ?? nearest;
  return host === null ? null : { host, target };
}

const NOBODY_AROUND = (): boolean => false;

/** Input types whose default action is NOT typing: cancelling them loses no character. */
const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'image',
  'file',
  'color',
  'range',
  'hidden',
]);

/**
 * Whether the gesture's target is somewhere the user WRITES.
 *
 * There the default action is the point: a `keydown` cancelled on a text field is a character
 * that never appears, and a synthetic event does not type it back. Duck-typed, like the rest
 * of this runtime, because what matters is what the node offers and not its class.
 */
function isEditable(target: EventTarget): boolean {
  const el = target as Partial<HTMLInputElement>;
  if (el.isContentEditable === true) return true;
  if (el.localName === 'textarea' || el.localName === 'select') return true;
  // An `<input>` always answers `type` — `text` when nobody wrote one.
  return el.localName === 'input' && !NON_TEXT_INPUTS.has((target as HTMLInputElement).type);
}

/**
 * Cancel a gesture the handler is not there to see, keeping what the user typed — and the file
 * dialog a click on a file input opens: the browser shows it only for the user's own click, so a
 * cancelled one would leave the user with no dialog, and the choice arrives later as a `change`.
 */
function withhold(event: Event, target: EventTarget): void {
  if (!isEditable(target) && !opensPicker(target)) event.preventDefault();
  event.stopImmediatePropagation();
}

export function createCapturer(config: CaptureConfig): (event: Event) => void {
  const { state, registry, onCold, onShared, listensAround = NOBODY_AROUND } = config;
  /**
   * The gestures that landed on an instance while its path 2 is in flight, in arrival order.
   *
   * Without it the first gesture raises the instance and every later one falls into path 1
   * with no listener there yet: a focus starts the download and the click that follows it by
   * a hundred milliseconds is lost. They wait with the first, and are replayed after it.
   */
  const pending = new Map<number, (() => void)[]>();
  /** Not hydrated, or hydrating: what a gesture still has to wait for. */
  const notUp = (id: number): boolean => !state.hydrated.has(id) || pending.has(id);

  return (event: Event): void => {
    const hit = targeted(event.composedPath(), notUp, listensAround);
    if (hit === null) {
      return;
    }
    const id = idOf(hit.host);
    const queue = pending.get(id);
    if (queue !== undefined) {
      // PATH 2, still in flight: this one waits behind the first.
      withhold(event, hit.target);
      queue.push(replayer(event, hit.target));
      return;
    }
    if (state.hydrated.has(id)) {
      return; // PATH 1
    }
    const tag = hit.host.localName;
    const wasDefined = registry.get(tag) !== undefined;
    // Before any await: a re-entrant dispatch — the replay itself — falls into path 1.
    state.hydrated.add(id);

    if (wasDefined) {
      onShared(hit.host, id); // PATH 3
      return;
    }

    // PATH 2. The half-done gesture must not take effect: it is replayed in full once
    // everything the user's handler presupposes alive is alive.
    withhold(event, hit.target);
    const waiting = [replayer(event, hit.target)];
    pending.set(id, waiting);
    onCold(hit.host, id, () => {
      // Out of the queue BEFORE replaying, so each replay re-enters as path 1.
      pending.delete(id);
      for (const replay of waiting) replay();
    });
  };
}
