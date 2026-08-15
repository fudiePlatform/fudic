import { describe, it, expect, beforeEach } from 'vitest';
import { createCascade, type Cascade } from '../../src/hydrate/cascade.js';
import { createChunkLoader } from '../../src/hydrate/chunks.js';
import { readPageMaps } from '../../src/hydrate/maps.js';
import { instanceState, type InstanceState } from '../../src/hydrate/registry.js';
import { defineRecorder, host, publish, TestRegistry, type Recorder } from './_page.js';

interface Harness {
  readonly cascade: Cascade;
  readonly state: InstanceState;
  readonly registry: TestRegistry;
  readonly trace: string[];
  readonly reported: string[];
}

/** The cascade over the document as it stands: the blocks are published before this runs. */
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
  const cascade = createCascade({
    maps,
    loader,
    registry,
    state,
    root: document,
    report: (id, tag, _ms, from) => {
      reported.push(`${from}:${tag}#${id}`);
    },
  });
  return { cascade, state, registry, trace, reported };
}

describe('the composition cascade', () => {
  beforeEach(() => {
    publish();
  });

  it('post-order: the deepest descendant first, and the root of the walk is NOT raised', async () => {
    publish({ tree: { 'cas-a': ['cas-b'], 'cas-b': ['cas-c'] }, state: [[0, 0, 0, 0], []] });
    const parent = host('cas-a', 0);
    const child = host('cas-b', 1, parent.shadowRoot!);
    host('cas-c', 2, child.shadowRoot!);

    const h = harness();
    await h.cascade.prepareTag('cas-a');

    expect(h.trace.filter((t) => t.startsWith('define:'))).toEqual(['define:cas-c', 'define:cas-b']);
    expect(h.reported).toEqual(['subtree:cas-c#2', 'subtree:cas-b#1']);
    expect(h.registry.get('cas-a')).toBeUndefined();
  });

  it('prepares the subtree of EVERY instance of the tag, not only the one clicked', async () => {
    publish({ tree: { 'cas-p': ['cas-k'] }, state: [[0, 0, 0, 0], []] });
    const first = host('cas-p', 0);
    host('cas-k', 1, first.shadowRoot!);
    const second = host('cas-p', 2);
    host('cas-k', 3, second.shadowRoot!);

    const h = harness();
    await h.cascade.prepareTag('cas-p');

    // One download for the tag, two instances raised: the sibling's subtree is alive before
    // anybody defines `cas-p`, which is what makes path 3 a correct no-op.
    expect(h.trace.filter((t) => t.startsWith('define:'))).toEqual(['define:cas-k']);
    expect(h.reported).toEqual(['subtree:cas-k#1', 'subtree:cas-k#3']);
  });

  it('hands every instance of a tag its own slice, exactly once', async () => {
    publish({ tree: {}, state: [[0, 2, 3], ['a', 'b', 'c']] });
    host('cas-slice', 0);
    host('cas-slice', 1);

    const h = harness();
    const loaderTrace = h.trace;
    defineRecorder(h.registry, 'cas-slice', loaderTrace);
    h.cascade.attachAll('cas-slice');
    h.cascade.attachAll('cas-slice'); // idempotent: `attached` governs the handout

    const [first, second] = [...document.querySelectorAll('cas-slice')] as Recorder[];
    expect(first?.slice).toEqual(['a', 'b']);
    expect(second?.slice).toEqual(['c']);
    expect(loaderTrace.filter((t) => t.startsWith('h:'))).toHaveLength(2);
  });

  it('a host with no shadow root has no subtree to descend into', async () => {
    publish({ tree: { 'cas-flat': ['cas-never'] }, state: [[0, 0], []] });
    // Not opened: what a component whose declarative shadow root never materialized looks
    // like. There is nothing to walk, and nothing must be invented.
    const el = document.createElement('cas-flat');
    el.setAttribute('data-fud-id', '0');
    document.body.appendChild(el);

    const h = harness();
    await h.cascade.prepareTag('cas-flat');

    expect(h.trace).toEqual([]);
    expect(h.registry.get('cas-never')).toBeUndefined();
  });

  it('a tag with no entry in `fud-tree` composes nothing', async () => {
    publish({ tree: { 'cas-other': ['cas-x'] }, state: [[0, 0], []] });
    host('cas-lonely', 0);

    const h = harness();
    await h.cascade.prepareTag('cas-lonely');

    expect(h.trace).toEqual([]);
    expect(h.reported).toEqual([]);
  });

  it('a descendant the runtime already raised is left alone', async () => {
    publish({ tree: { 'cas-q': ['cas-r'] }, state: [[0, 0, 0], []] });
    const parent = host('cas-q', 0);
    host('cas-r', 1, parent.shadowRoot!);

    const h = harness();
    h.state.hydrated.add(1);
    await h.cascade.prepareTag('cas-q');

    expect(h.trace).toEqual([]);
    expect(h.reported).toEqual([]);
  });
});
