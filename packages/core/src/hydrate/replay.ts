/**
 * Step 6 of path 2: re-emitting the gesture that had nobody to handle it (SDD-17 §4.5).
 *
 * The event is rebuilt with its ORIGINAL constructor — `new e.constructor(type, …)` — with
 * `Event` as the fallback, and dispatched on `composedPath()[0]`: in the capture phase
 * `e.target` is retargeted to the host, while the real target lives inside the shadow.
 *
 * **The replay re-enters the capturer, and that is deliberate.** It is `composed` like the
 * original and the capturer sits on the document, so it comes straight back — harmless,
 * because the instance is already in `hydrated` and falls into path 1, where the runtime
 * withdraws. The closure is that state check, not switching `composed` off.
 *
 * Events carrying data the constructor cannot reproduce (exact coordinates, `dataTransfer`)
 * are outside the validated scope, which is `click` (§8).
 */

/** The constructor side of any event: `Event` and every subclass take `(type, init)`. */
type EventCtor = new (type: string, init: EventInit) => Event;

/**
 * Snapshot the gesture NOW and hand back the one function that repeats it.
 *
 * Snapshotting is not an optimization: by the time the replay runs, several `await`s have
 * passed and the event is no longer being dispatched, so `composedPath()` is empty and
 * `target` has been retargeted back. What the replay needs has to be read synchronously,
 * inside the capture listener.
 */
export function replayer(event: Event, target: EventTarget): () => void {
  const type = event.type;
  const composed = event.composed;
  const Ctor = event.constructor as EventCtor;
  return () => {
    const init: EventInit = { bubbles: true, cancelable: true, composed };
    let replay: Event;
    try {
      replay = new Ctor(type, init);
    } catch {
      // A constructor that refuses `(type, init)` — a legacy interface, an event created by
      // `document.createEvent`. The gesture is worth more than its exact class.
      replay = new Event(type, init);
    }
    target.dispatchEvent(replay);
  };
}
