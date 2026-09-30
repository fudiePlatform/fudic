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
 * **What the handler reads travels with it.** A `keydown` replayed without its `key`, or an
 * `input` without its `inputType`, reaches a handler that cannot tell what happened. So the
 * init is copied from the original, field by field, for every field the family of events the
 * capturer listens to carries — and only those the original actually has, because an init
 * member a constructor does not know is ignored, while one the event lacks would be invented.
 */

/** The constructor side of any event: `Event` and every subclass take `(type, init)`. */
type EventCtor = new (type: string, init: EventInit) => Event;

/**
 * The init members worth copying: the `UIEvent`, `MouseEvent`, `PointerEvent`,
 * `KeyboardEvent`, `InputEvent` and `FocusEvent` dictionaries, which are the families of the
 * captured types. Read-only state the constructor recomputes (`target`, `timeStamp`,
 * `isTrusted`) is deliberately absent.
 */
const INIT_KEYS: readonly string[] = [
  // UIEvent
  'view',
  'detail',
  // modifiers, shared by mouse and keyboard
  'ctrlKey',
  'shiftKey',
  'altKey',
  'metaKey',
  // MouseEvent
  'screenX',
  'screenY',
  'clientX',
  'clientY',
  'movementX',
  'movementY',
  'button',
  'buttons',
  // MouseEvent, FocusEvent
  'relatedTarget',
  // PointerEvent
  'pointerId',
  'pointerType',
  'isPrimary',
  'width',
  'height',
  'pressure',
  // KeyboardEvent
  'key',
  'code',
  'location',
  'repeat',
  'isComposing',
  'charCode',
  'keyCode',
  // InputEvent
  'data',
  'inputType',
  'dataTransfer',
];

/** The original's init, read NOW: after an `await` some of it is no longer there. */
function initOf(event: Event): EventInit {
  const source = event as unknown as Record<string, unknown>;
  const init: Record<string, unknown> = {
    bubbles: true,
    cancelable: true,
    composed: event.composed,
  };
  for (const key of INIT_KEYS) {
    if (key in event) init[key] = source[key];
  }
  return init as EventInit;
}

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
  const init = initOf(event);
  const Ctor = event.constructor as EventCtor;
  return () => {
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
