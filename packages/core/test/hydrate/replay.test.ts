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

describe('SDD-47 §4.3 — what the handler reads travels with the replay', () => {
  /** Replay `original` on a fresh target and hand back what a listener received. */
  function replayed<E extends Event>(original: E): E {
    const target = new EventTarget();
    let seen: Event | undefined;
    target.addEventListener(original.type, (e) => (seen = e));
    replayer(original, target)();
    return seen as E;
  }

  it('a keydown keeps its key, its code and its modifiers', () => {
    const e = replayed(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', shiftKey: true, repeat: true }),
    );
    expect(e).toBeInstanceOf(KeyboardEvent);
    expect(e.key).toBe('Enter');
    expect(e.code).toBe('Enter');
    expect(e.shiftKey).toBe(true);
    expect(e.repeat).toBe(true);
  });

  it('an input keeps its inputType and its data', () => {
    const e = replayed(new InputEvent('input', { inputType: 'insertText', data: 'a' }));
    expect(e.inputType).toBe('insertText');
    expect(e.data).toBe('a');
  });

  it('a click keeps its coordinates, its button and its detail', () => {
    const e = replayed(
      new MouseEvent('click', { clientX: 12, clientY: 34, button: 1, detail: 2, ctrlKey: true }),
    );
    expect(e.clientX).toBe(12);
    expect(e.clientY).toBe(34);
    expect(e.button).toBe(1);
    expect(e.detail).toBe(2);
    expect(e.ctrlKey).toBe(true);
  });

  it('a focusout keeps where the focus went', () => {
    const next = document.createElement('button');
    const e = replayed(new FocusEvent('focusout', { relatedTarget: next }));
    expect(e.relatedTarget).toBe(next);
  });

  it('invents nothing the original does not carry', () => {
    const e = replayed(new Event('custom-thing', { composed: true }));
    expect('key' in e).toBe(false);
    expect('clientX' in e).toBe(false);
    expect(e.composed).toBe(true);
    // Always replayable by the component's own listener on the bubble, and cancellable.
    expect(e.bubbles).toBe(true);
    expect(e.cancelable).toBe(true);
  });
});
