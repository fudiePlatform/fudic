import { describe, it, expect, beforeEach } from 'vitest';
import { createBusPrehydrator, type PreHydrateBus } from '../../src/hydrate/bus.js';
import { createCascade } from '../../src/hydrate/cascade.js';
import { createChunkLoader } from '../../src/hydrate/chunks.js';
import { readPageMaps } from '../../src/hydrate/maps.js';
import { instanceState, type InstanceState } from '../../src/hydrate/registry.js';
import { defineRecorder, host, publish, TestRegistry } from './_page.js';

interface Harness {
  readonly preHydrateBus: PreHydrateBus;
  readonly state: InstanceState;
  readonly registry: TestRegistry;
  readonly trace: string[];
  readonly reported: string[];
}

function harness(): Harness {
  const trace: string[] = [];
  const reported: string[] = [];
  const maps = readPageMaps(document);
  const state = instanceState();
  const registry = new TestRegistry();
  const loader = createChunkLoader({
    registry,
    resolveChunk: (tag) => tag,
    importModule: async (tag) => {
      defineRecorder(registry, tag, trace);
    },
  });
  const report = (id: number, tag: string, _ms: string, from: string): void => {
    reported.push(`${from}:${tag}#${id}`);
  };
  const cascade = createCascade({ maps, loader, registry, state, root: document, report });
  const preHydrateBus = createBusPrehydrator({
    maps,
    loader,
    registry,
    cascade,
    state,
    root: document,
    report,
  });
  return { preHydrateBus, state, registry, trace, reported };
}

describe('directed hydration: the receivers, before the emitter', () => {
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

    // The receiver's own subtree first — defining its tag upgrades its instances, so the
    // invariant of §4.4 applies to it verbatim — then the receiver, then the next one.
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
