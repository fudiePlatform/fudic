import { describe, it, expect } from 'vitest';
import { replayer } from '../../src/hydrate/replay.js';

describe('replaying the gesture that had nobody to handle it', () => {
  it('rebuilds the event with its own constructor and dispatches it on the real target', () => {
    document.body.innerHTML = '<button id="go">go</button>';
    const target = document.getElementById('go')!;
    const seen: Event[] = [];
    document.addEventListener('click', (e) => seen.push(e));

    const original = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
    replayer(original, target)();

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(MouseEvent);
    expect(seen[0]?.type).toBe('click');
    expect(seen[0]).not.toBe(original); // a fresh event, not a re-dispatch of a used one
    expect(seen[0]?.composed).toBe(true);
  });

  it('falls back to `Event` when the original constructor refuses `(type, init)`', () => {
    const target = new EventTarget();
    const seen: Event[] = [];
    target.addEventListener('legacy', (e) => seen.push(e));

    // An event whose interface cannot be constructed — what `document.createEvent` and the
    // legacy interfaces leave behind. The gesture is worth more than its exact class.
    const hostile = {
      type: 'legacy',
      composed: false,
      constructor: function Hostile(): never {
        throw new TypeError('Illegal constructor');
      },
    } as unknown as Event;

    replayer(hostile, target)();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.type).toBe('legacy');
  });
});
