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

import { replayer } from './replay.js';
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
}

/** The nearest hydratable host of a composed path, and the real target under it. */
function targeted(path: readonly EventTarget[]): { host: Element; target: EventTarget } | null {
  const target = path[0];
  if (target === undefined) {
    return null; // an event that is not being dispatched has no path
  }
  for (const node of path) {
    if (node instanceof Element && node.hasAttribute(ID_ATTR)) {
      return { host: node, target };
    }
  }
  return null;
}

export function createCapturer(config: CaptureConfig): (event: Event) => void {
  const { state, registry, onCold, onShared } = config;

  return (event: Event): void => {
    const hit = targeted(event.composedPath());
    if (hit === null) {
      return;
    }
    const id = idOf(hit.host);
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
    event.preventDefault();
    event.stopImmediatePropagation();
    onCold(hit.host, id, replayer(event, hit.target));
  };
}
