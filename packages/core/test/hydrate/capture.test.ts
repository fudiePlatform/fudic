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
  document.addEventListener('click', capture, true);
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
      document.removeEventListener('click', capture, true);
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
