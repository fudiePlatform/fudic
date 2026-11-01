import { describe, it, expect, beforeEach } from 'vitest';
import { createBusPrehydrator, type PreHydrateBus } from '../../src/hydrate/bus.js';
import { cascadeHarness, host, publish, type CascadeHarness } from './_page.js';

function harness(): CascadeHarness & { readonly preHydrateBus: PreHydrateBus } {
  const h = cascadeHarness();
  const preHydrateBus = createBusPrehydrator({
    maps: h.maps,
    registry: h.registry,
    cascade: h.cascade,
    state: h.state,
    root: document,
    report: h.report,
  });
  return { ...h, preHydrateBus };
}

describe('the listeners of a tag come up before it', () => {
  beforeEach(() => {
    publish();
  });

  it('raises each receiver with its own subtree, in the order the map lists them', async () => {
    publish({
      bus: { 'bus-emitter': ['bus-first', 'bus-second'] },
      tree: { 'bus-first': ['bus-kid'] },
      state: [[0, 0, 0, 0, 0], []],
    });
    host('bus-emitter', 0);
    const first = host('bus-first', 1);
    host('bus-kid', 2, first.shadowRoot!);
    host('bus-second', 3);

    const h = harness();
    await h.preHydrateBus('bus-emitter');

    expect(h.trace.filter((t) => t.startsWith('define:'))).toEqual([
      'define:bus-kid',
      'define:bus-first',
      'define:bus-second',
    ]);
    expect(h.reported).toEqual(['subtree:bus-kid#2', 'bus:bus-first#1', 'bus:bus-second#3']);
    expect(h.registry.get('bus-emitter')).toBeUndefined();
  });

  it('a receiver already alive satisfies the order by itself', async () => {
    publish({ bus: { 'bus-e2': ['bus-live'] }, state: [[0, 0], []] });
    host('bus-live', 0);

    const h = harness();
    h.registry.define('bus-live', class extends HTMLElement {});
    await h.preHydrateBus('bus-e2');

    expect(h.trace).toEqual([]);
    expect(h.reported).toEqual([]);
  });

  it('a tag that emits to nobody pre-hydrates nothing', async () => {
    publish({ bus: { 'bus-other': ['bus-x'] }, state: [[0, 0], []] });
    host('bus-quiet', 0);

    const h = harness();
    await h.preHydrateBus('bus-quiet');

    expect(h.trace).toEqual([]);
  });

  it('an instance the runtime already raised is not reported twice', async () => {
    publish({ bus: { 'bus-e3': ['bus-twice'] }, state: [[0, 0, 0], []] });
    host('bus-twice', 0);
    host('bus-twice', 1);

    const h = harness();
    h.state.hydrated.add(0);
    await h.preHydrateBus('bus-e3');

    expect(h.reported).toEqual(['bus:bus-twice#1']);
  });
});
