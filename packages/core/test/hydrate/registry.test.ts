import { describe, it, expect } from 'vitest';
import {
  allInstances,
  idOf,
  instanceState,
  instancesOf,
  stopwatch,
} from '../../src/hydrate/registry.js';
import { host, publish } from './_page.js';

describe('finding instances across shadow boundaries', () => {
  it('descends through shadowRoot, in the pre-order the server numbered in', () => {
    publish();
    const parent = host('reg-parent', 0);
    const child = host('reg-child', 1, parent.shadowRoot!);
    host('reg-leaf', 2, child.shadowRoot!);
    host('reg-tail', 3);

    expect(allInstances(document).map(idOf)).toEqual([0, 1, 2, 3]);
  });

  it('a host of the same tag WITHOUT an id is not an instance', () => {
    publish();
    host('reg-card', 0);
    // A component the page rendered but claimed nothing for: it is not hydratable.
    document.body.appendChild(document.createElement('reg-card'));
    host('reg-card', 1);

    expect(instancesOf('reg-card', document).map(idOf)).toEqual([0, 1]);
  });

  it('by tag, and only that tag — inside shadow roots too', () => {
    publish();
    const parent = host('reg-outer', 0);
    host('reg-inner', 1, parent.shadowRoot!);
    host('reg-inner', 2, parent.shadowRoot!);

    expect(instancesOf('reg-inner', document).map(idOf)).toEqual([1, 2]);
    expect(instancesOf('reg-missing', document)).toEqual([]);
  });

  it('the two sets are two: `hydrated` governs the paths, `attached` the handout', () => {
    const state = instanceState();
    state.attached.add(7);
    expect(state.hydrated.has(7)).toBe(false);
  });

  it('the stopwatch reports in the one format `fud:hydrated` declares', () => {
    expect(stopwatch()()).toMatch(/^\d+\.\d$/u);
  });
});
