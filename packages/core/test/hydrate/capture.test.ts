import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createCapturer } from '../../src/hydrate/capture.js';
import { instanceState, type InstanceState } from '../../src/hydrate/registry.js';
import { host, publish, TestRegistry } from './_page.js';

interface Harness {
  readonly state: InstanceState;
  readonly registry: TestRegistry;
  readonly cold: string[];
  readonly shared: string[];
  /** The listener itself, for the one case a dispatch cannot produce. */
  capture: (event: Event) => void;
  /** The replay handed over by the last cold path, so a test can fire it deliberately. */
  replay: (() => void) | null;
}

/** The types these tests dispatch: a pointer gesture and a keyboard one. */
const TYPES = ['click', 'keydown'] as const;

/** Every capturer installed by a test, so the next one starts on a clean document. */
const installed: ((event: Event) => void)[] = [];

function install(): Harness {
  const h: Harness = {
    state: instanceState(),
    registry: new TestRegistry(),
    cold: [],
    shared: [],
    capture: () => undefined,
    replay: null,
  };
  const capture = createCapturer({
    state: h.state,
    registry: h.registry,
    onCold: (element, id, replay) => {
      h.cold.push(`${element.localName}#${id}`);
      h.replay = replay;
    },
    onShared: (element, id) => {
      h.shared.push(`${element.localName}#${id}`);
    },
  });
  for (const type of TYPES) document.addEventListener(type, capture, true);
  installed.push(capture);
  h.capture = capture;
  return h;
}

function click(target: EventTarget): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(event);
  return event;
}

describe('the capturer and its three paths', () => {
  beforeEach(() => {
    publish();
  });

  afterEach(() => {
    // A capturer left behind would see the next test's clicks with a stale set of hydrated
    // instances, and cancel a gesture the test expects to travel untouched.
    for (const capture of installed.splice(0)) {
      for (const type of TYPES) document.removeEventListener(type, capture, true);
    }
  });

  it('an event with no hydratable host in its path is not ours', () => {
    const h = install();
    document.body.appendChild(document.createElement('p'));
    click(document.querySelector('p')!);

    expect(h.cold).toEqual([]);
    expect(h.shared).toEqual([]);
  });

  it('an event that is not being dispatched has no path, and no host either', () => {
    const h = install();
    // An event that never travelled has an EMPTY `composedPath()`, and the only way to reach
    // the listener with one is to call it: a dispatch, by definition, builds a path.
    h.capture(new MouseEvent('click'));

    expect(h.cold).toEqual([]);
    expect(h.shared).toEqual([]);
  });

  it('path 2: the tag is not defined, so the gesture is cancelled and delegated', () => {
    const h = install();
    const cold = host('cap-cold', 4);
    const inner = document.createElement('button');
    cold.shadowRoot!.appendChild(inner);

    const event = click(inner);

    expect(h.cold).toEqual(['cap-cold#4']);
    expect(event.defaultPrevented).toBe(true);
    // Marked BEFORE anything asynchronous: the replay itself re-enters and must fall into
    // path 1.
    expect(h.state.hydrated.has(4)).toBe(true);
    expect(typeof h.replay).toBe('function');
  });

  it('path 1: an instance already hydrated makes the runtime withdraw', () => {
    const h = install();
    const el = host('cap-live', 5);
    h.state.hydrated.add(5);

    const event = click(el);

    expect(h.cold).toEqual([]);
    expect(h.shared).toEqual([]);
    expect(event.defaultPrevented).toBe(false); // `ev` intact for the component's listener
  });

  it('path 3: the tag was already defined by another instance — mark and leave', () => {
    const h = install();
    h.registry.define('cap-shared', class extends HTMLElement {});
    const el = host('cap-shared', 6);

    const event = click(el);

    expect(h.shared).toEqual(['cap-shared#6']);
    expect(h.cold).toEqual([]);
    expect(event.defaultPrevented).toBe(false); // no stop, no replay: that would fire twice
    expect(h.state.hydrated.has(6)).toBe(true);
  });
});

function keydown(target: EventTarget, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true });
  target.dispatchEvent(event);
  return event;
}

/** A cold instance with `child` inside its shadow, ready for a first gesture. */
function coldWith<E extends Element>(tag: string, id: number, child: E): E {
  host(tag, id).shadowRoot!.appendChild(child);
  return child;
}

describe('SDD-47 §4.3 — what the user writes is not cancelled', () => {
  beforeEach(() => {
    publish();
  });

  afterEach(() => {
    for (const capture of installed.splice(0)) {
      for (const type of TYPES) document.removeEventListener(type, capture, true);
    }
  });

  const input = (type: string): HTMLInputElement => {
    const el = document.createElement('input');
    el.type = type;
    return el;
  };

  it.each([
    ['a text input', () => input('text')],
    ['an input with no type at all', () => document.createElement('input')],
    ['a textarea', () => document.createElement('textarea')],
    ['a select', () => document.createElement('select')],
  ])('the first key on %s keeps its default action', (_label, make) => {
    install();
    const event = keydown(coldWith('cap-edit', 20, make()), 'a');
    expect(event.defaultPrevented).toBe(false);
  });

  it('a contenteditable element is somewhere the user writes too', () => {
    install();
    const div = document.createElement('div');
    // Asked of the node and not of its attribute: it is what the element OFFERS that counts.
    Object.defineProperty(div, 'isContentEditable', { value: true });
    const event = keydown(coldWith('cap-edit', 21, div), 'a');
    expect(event.defaultPrevented).toBe(false);
  });

  it.each(['checkbox', 'radio', 'button', 'submit', 'reset', 'image', 'file', 'color', 'range', 'hidden'])(
    'an input of type %s is not written into, so its gesture is cancelled',
    (type) => {
      install();
      const event = click(coldWith('cap-edit', 22, input(type)));
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it('a button is not written into either', () => {
    install();
    const event = click(coldWith('cap-edit', 23, document.createElement('button')));
    expect(event.defaultPrevented).toBe(true);
  });

  it('not cancelling is not letting it through: the component still sees the gesture once', () => {
    const h = install();
    const field = coldWith('cap-edit', 24, input('text'));
    let heard = 0;
    field.addEventListener('keydown', () => heard++);

    keydown(field, 'a');
    expect(heard).toBe(0); // withheld, like any other cold gesture

    h.replay!();
    expect(heard).toBe(1);
  });
});

describe('SDD-47 §4.4 — gestures that land while an instance is being raised', () => {
  beforeEach(() => {
    publish();
  });

  afterEach(() => {
    for (const capture of installed.splice(0)) {
      for (const type of TYPES) document.removeEventListener(type, capture, true);
    }
  });

  it('wait behind the first, withheld, and do not raise the instance again', () => {
    const h = install();
    const button = coldWith('cap-queue', 30, document.createElement('button'));

    click(button);
    const second = click(button);

    expect(h.cold).toEqual(['cap-queue#30']); // one path 2, not two
    expect(second.defaultPrevented).toBe(true);
  });

  it('are replayed after the first, in the order they arrived', () => {
    const h = install();
    const button = coldWith('cap-queue', 31, document.createElement('button'));
    const heard: string[] = [];
    button.addEventListener('click', () => heard.push('click'));
    button.addEventListener('keydown', (e) => heard.push(`key ${e.key}`));

    click(button);
    keydown(button, 'x');
    click(button);
    expect(heard).toEqual([]);

    h.replay!();
    expect(heard).toEqual(['click', 'key x', 'click']);
  });

  it('a gesture after the replay is path 1: the queue closed before replaying', () => {
    const h = install();
    const button = coldWith('cap-queue', 32, document.createElement('button'));
    click(button);
    h.replay!();

    const later = click(button);
    expect(later.defaultPrevented).toBe(false);
    expect(h.cold).toEqual(['cap-queue#32']);
  });

  it('a gesture on another instance is not queued behind this one', () => {
    const h = install();
    const a = coldWith('cap-queue', 33, document.createElement('button'));
    const b = coldWith('cap-queue', 34, document.createElement('button'));

    click(a);
    click(b);

    expect(h.cold).toEqual(['cap-queue#33', 'cap-queue#34']);
  });
});
