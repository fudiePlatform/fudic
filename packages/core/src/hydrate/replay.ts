type EventCtor = new (type: string, init: EventInit) => Event;

// The init members of the event families the capturer listens to: UI, mouse, pointer,
// keyboard, input and focus events. Only those the original has are copied.
const INIT_KEYS: readonly string[] = [
  'view',
  'detail',
  'ctrlKey',
  'shiftKey',
  'altKey',
  'metaKey',
  'screenX',
  'screenY',
  'clientX',
  'clientY',
  'movementX',
  'movementY',
  'button',
  'buttons',
  'relatedTarget',
  'pointerId',
  'pointerType',
  'isPrimary',
  'width',
  'height',
  'pressure',
  'key',
  'code',
  'location',
  'repeat',
  'isComposing',
  'charCode',
  'keyCode',
  'data',
  'inputType',
  'dataTransfer',
];

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
 * Snapshots a withheld gesture and returns the function that dispatches it again on its real
 * target. The snapshot is taken now because once the event stops dispatching its path is empty.
 * The replay comes back through the capturer, which finds the instance up and lets it through.
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
      // A constructor that refuses `(type, init)`, as legacy event interfaces do.
      replay = new Event(type, init);
    }
    target.dispatchEvent(replay);
  };
}
