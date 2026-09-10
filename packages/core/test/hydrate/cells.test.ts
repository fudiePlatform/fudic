/**
 * The measurement of BUG-24, written BEFORE the mechanism exists: what a page loses today
 * because a value — and only a value — crosses the shadow boundary.
 *
 * Everything here is driven end to end over the page the runtime actually reads: the three
 * JSON blocks, the hosts with their `data-fud-id`, and chunks that do character for
 * character what the emit is going to write. Nothing is mocked at the seam under test — the
 * question is whether parent and child end up holding the SAME object, and a fake that
 * hands one over would be answering it by construction.
 *
 * The four were written as `it.fails` first and flipped to `it` by the commit that landed the
 * registry, so the diff itself is the proof. What each of them said before it:
 *
 *  1. `expected +0 to be { $: [ 0, 1 ] }` — the child held the MARKER, a plain JSON object,
 *     while the parent held the `0` that sat in its own slot: `$p1 ?? signal(start)` gave
 *     back the number, because nothing turned that slot into anything else. Two different
 *     things, never mind two objects.
 *  2. the same reading, one level further down: the grandchild held a second copy of it.
 *  3. `TypeError: child.value.set is not a function` — a marker has no `set`.
 *  4. `TypeError: this.onSave is not a function` — nor is a marker callable, so neither
 *     owner was ever reached.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCascade, type Cascade } from '../../src/hydrate/cascade.js';
import { createChunkLoader } from '../../src/hydrate/chunks.js';
import { createCells, isCellMark } from '../../src/hydrate/cells.js';
import { installHydration } from '../../src/hydrate/install.js';
import { readPageMaps } from '../../src/hydrate/maps.js';
import { idOf, instancesOf, instanceState } from '../../src/hydrate/registry.js';
import { signal, type Signal } from '../../src/signal.js';
import { host, publish, TestRegistry } from './_page.js';

/**
 * The owner's chunk: a `start` prop, then its two cells — a signal and a callback — in the
 * slots the emit reserves BEHIND the props (BUG-24 §4.2).
 *
 * `$p1 ?? signal(start)` is the one expression of §4.4: filled by `h`, empty by `c`. Class
 * FIELDS are never initialised here, and that is not an oversight — an upgrade is a
 * prototype swap with no constructor call, exactly as the platform's `define` does it over
 * an instance already in the tree.
 */
class CellParent extends HTMLElement {
  count!: Signal<number>;
  saved!: unknown[];

  h(props: readonly unknown[]): void {
    const [start, $p1, $p2] = props as [
      number,
      Signal<number> | undefined,
      Signal<unknown> | undefined,
    ];
    this.count = $p1 ?? signal(start);
    this.saved = [];
    // `$fill` — the owner puts the live function in the cell it reserved (§4.6, step 3).
    $p2?.set((what: unknown): void => {
      this.saved.push(what);
    });
  }
}

/** A consumer: whatever arrived in its single slot, kept so a test can look at it. */
class CellConsumer extends HTMLElement {
  value!: unknown;

  h(props: readonly unknown[]): void {
    this.value = props[0];
  }
}

/** The child with a callback prop: it reads the cell at the moment it calls (§4.6, step 4). */
class CellForm extends HTMLElement {
  onSave!: Signal<(what: unknown) => void>;

  h(props: readonly unknown[]): void {
    this.onSave = props[0] as Signal<(what: unknown) => void>;
  }

  submit(what: unknown): void {
    this.onSave()(what);
  }
}

const CHUNKS: Readonly<Record<string, CustomElementConstructor>> = {
  'cell-parent': CellParent,
  'cell-child': CellConsumer,
  'cell-kid': CellConsumer,
  'cell-form': CellForm,
};

interface Harness {
  readonly cascade: Cascade;
  readonly registry: TestRegistry;
  /**
   * Path 2 of SDD-17 §4.4 minus the bus, which no component here emits on: the subtree of
   * every instance of the tag in post-order, then the tag itself, then the handout. It is
   * what a click on that tag does, and hydrating by hand instead would be testing a
   * sequence the runtime never runs.
   */
  raise(tag: string): Promise<void>;
  /** `from:tag#id`, in order — the trace criterion 15 reads. */
  readonly reported: string[];
}

function harness(): Harness {
  const reported: string[] = [];
  const registry = new TestRegistry();
  const loader = createChunkLoader({
    registry,
    resolveChunk: (tag) => tag,
    importModule: async (tag) => {
      registry.define(tag, CHUNKS[tag]!);
    },
  });
  const maps = readPageMaps(document);
  const cascade = createCascade({
    maps,
    cells: createCells(maps),
    loader,
    registry,
    state: instanceState(),
    root: document,
    report: (id, tag, _ms, from) => {
      reported.push(`${from}:${tag}#${id}`);
    },
  });
  return {
    cascade,
    registry,
    reported,
    async raise(tag: string): Promise<void> {
      await cascade.prepareTag(tag);
      await loader.ensureDefined(tag);
      await cascade.prepareCells(tag);
      cascade.attachAll(tag);
      // What `install.ts` reports for the host that was clicked. `instancesOf` and not
      // `querySelectorAll`, because the host may well be inside a shadow root.
      for (const el of instancesOf(tag, document)) {
        reported.push(`downloaded:${tag}#${idOf(el)}`);
      }
    },
  };
}

/**
 * The acceptance page of §6, by hand: an owner whose shadow holds a child (which holds a
 * grandchild) and a form.
 *
 *     [[0,3,4,5,6],[ 0, 0, null, {"$":[0,1]}, {"$":[0,1]}, {"$f":[0,2]} ]]
 *
 * Instance 0 is `[ start=0, count=0, save=null ]`: the props first, the cells behind them,
 * a function serialised as `null` because it has no value to serialise. The three markers
 * all point BACKWARDS, which the pre-order of `claim()` guarantees.
 */
function publishTree(): { parent: Element; child: Element; kid: Element; form: Element } {
  publish({
    tree: { 'cell-parent': ['cell-child', 'cell-form'], 'cell-child': ['cell-kid'] },
    state: [
      [0, 3, 4, 5, 6],
      [0, 0, null, { $: [0, 1] }, { $: [0, 1] }, { $f: [0, 2] }],
    ],
  });
  const parent = host('cell-parent', 0);
  const child = host('cell-child', 1, parent.shadowRoot!);
  const kid = host('cell-kid', 2, child.shadowRoot!);
  const form = host('cell-form', 3, parent.shadowRoot!);
  return { parent, child, kid, form };
}

/** Two owners, one form each: the arrangement a `document`-wide bus cannot tell apart. */
function publishTwoOwners(): { forms: readonly CellForm[]; owners: readonly CellParent[] } {
  publish({
    tree: { 'cell-parent': ['cell-form'] },
    state: [
      [0, 3, 4, 7, 8],
      [0, 0, null, { $f: [0, 2] }, 0, 0, null, { $f: [2, 2] }],
    ],
  });
  const first = host('cell-parent', 0);
  const firstForm = host('cell-form', 1, first.shadowRoot!);
  const second = host('cell-parent', 2);
  const secondForm = host('cell-form', 3, second.shadowRoot!);
  // Handed back rather than queried: `querySelectorAll` does not cross a shadow boundary,
  // and both forms live inside one.
  return {
    forms: [firstForm, secondForm] as CellForm[],
    owners: [first, second] as CellParent[],
  };
}

describe('a signal and a callback across the shadow boundary', () => {
  beforeEach(() => {
    publish();
  });

  it('the same object: parent.count IS child.value', async () => {
    const { parent, child } = publishTree();
    const h = harness();
    await h.raise('cell-parent');

    expect((parent as CellParent).count).toBe((child as CellConsumer).value);
  });

  it('and the grandchild holds it too, three levels down', async () => {
    const { parent, kid } = publishTree();
    const h = harness();
    await h.raise('cell-parent');

    expect((parent as CellParent).count).toBe((kid as CellConsumer).value);
  });

  it('a write from below reaches an owner that was still cold', async () => {
    const { parent, child } = publishTree();
    const h = harness();
    // Only the child: the owner has not been defined, upgraded or handed anything.
    await h.raise('cell-child');

    ((child as CellConsumer).value as Signal<number>).set(7);

    await h.raise('cell-parent');
    expect((parent as CellParent).count()).toBe(7);
  });

  it('the owner first: hydrating it before anybody else gives the same object', async () => {
    // Criterion 9, the other way round. The owner's slot carries a VALUE, not a marker, so
    // this is the case the payload sweep exists for: without it `$p1 ?? signal(start)` would
    // hand the owner the plain `0` sitting there and the child would build a second cell.
    const { parent, child } = publishTree();
    const h = harness();
    h.registry.define('cell-parent', CellParent);
    h.cascade.attachAll('cell-parent');
    await h.raise('cell-child');

    expect((parent as CellParent).count).toBe((child as CellConsumer).value);
    expect((parent as CellParent).count()).toBe(0);
  });

  it('an empty cell raises its owner, and the owner brings its subtree (§6.13, §6.15)', async () => {
    const { parent, form } = publishTree();
    const h = harness();
    // The form is clicked while its owner — an ancestor, outside its own subtree — is cold.
    await h.raise('cell-form');

    // The climb is a CASCADE, not a jump. An owner is a host, and a host is hooked up last:
    // its `$s()` hands every child host its slice, so a sibling that was never upgraded is a
    // plain `HTMLElement` with no `u` on it — which is how raising the owner alone threw
    // `u is not a function` on the first sibling that was not the one that asked.
    expect(h.reported).toEqual([
      'subtree:cell-kid#2',
      'subtree:cell-child#1',
      'subtree:cell-form#3',
      'subtree:cell-parent#0',
      'downloaded:cell-form#3',
    ]);
    // The form is therefore handed its slice BEFORE its owner runs, and that costs nothing:
    // a cell is read at the moment it is called, so what its slot points at is filled by the
    // time anything reads it. The callback still runs on this same first gesture.
    (form as CellForm).submit('now');
    expect((parent as CellParent).saved).toEqual(['now']);
  });

  it('an owner already up is not raised a second time', async () => {
    publishTree();
    const h = harness();
    await h.raise('cell-parent');
    const before = h.reported.length;
    await h.raise('cell-form');

    expect(h.reported.slice(before)).toEqual(['downloaded:cell-form#3']);
  });

  it('two dependents on ONE owner raise it once between them', async () => {
    publish({
      tree: { 'cell-parent': ['cell-form'] },
      state: [
        [0, 3, 4, 5],
        [0, 0, null, { $f: [0, 2] }, { $f: [0, 2] }],
      ],
    });
    const owner = host('cell-parent', 0);
    const first = host('cell-form', 1, owner.shadowRoot!);
    const second = host('cell-form', 2, owner.shadowRoot!);
    const h = harness();
    await h.raise('cell-form');

    expect(h.reported.filter((r) => r.includes('cell-parent'))).toEqual(['subtree:cell-parent#0']);
    (first as CellForm).submit('a');
    (second as CellForm).submit('b');
    expect((owner as CellParent).saved).toEqual(['a', 'b']);
  });

  it('a marker pointing at an instance that is not in the tree does not throw', async () => {
    // The payload is what it is: a host may have been removed. The cell simply keeps the
    // value the payload gave it, and the page carries on.
    publish({ tree: {}, state: [[0, 1], [{ $f: [9, 0] }]] });
    const orphan = host('cell-form', 0);
    const h = harness();
    await h.raise('cell-form');

    expect((orphan as CellForm).onSave).toBeDefined();
    expect(h.reported).toEqual(['downloaded:cell-form#0']);
  });

  it('two forms with different owners call each its own', async () => {
    const { forms, owners } = publishTwoOwners();
    const h = harness();
    await h.raise('cell-parent');

    forms[0]!.submit('first');
    forms[1]!.submit('second');

    expect(owners[0]!.saved).toEqual(['first']);
    expect(owners[1]!.saved).toEqual(['second']);
  });
});

describe('the registry itself', () => {
  beforeEach(() => {
    publish();
  });

  it('a slot that is not a marker is left exactly as it is', () => {
    publish({ state: [[0, 4], [1, 'two', null, { id: 3 }]] });
    const cells = createCells(readPageMaps(document));
    expect(cells.resolve(0)).toEqual([1, 'two', null, { id: 3 }]);
  });

  it('an instance with no `$f` depends on nobody', () => {
    publish({ state: [[0, 2, 3], [0, 0, { $: [0, 1] }]] });
    const cells = createCells(readPageMaps(document));
    expect(cells.eager(1)).toEqual([]);
    expect(cells.eager(0)).toEqual([]);
  });

  it('§6.16 — clear() empties it, so a second visit starts from the new payload', () => {
    publish({ state: [[0, 2, 3], [0, 7, { $: [0, 1] }]] });
    const cells = createCells(readPageMaps(document));
    const first = cells.get([0, 1]);
    expect(first()).toBe(7);
    first.set(99);

    cells.clear();
    const second = cells.get([0, 1]);
    // A different object, back at the value the payload carries: without this a SPA would
    // accumulate one cell per instance per route visited, and the second visit would open
    // with the state the first one left behind.
    expect(second).not.toBe(first);
    expect(second()).toBe(7);
  });
});

describe('installHydration hands the registry back (§6.16)', () => {
  it('so a router that navigates IN PLACE has something to clear', () => {
    publish({ state: [[0, 2, 3], [0, 5, { $: [0, 1] }]] });
    host('cell-parent', 0);
    const { cells } = installHydration({
      root: document,
      document,
      registry: new TestRegistry(),
      resolveChunk: (tag) => tag,
      importModule: async () => {},
    });

    const first = cells.get([0, 1]);
    first.set(42);
    cells.clear();
    expect(cells.get([0, 1])).not.toBe(first);
    expect(cells.get([0, 1])()).toBe(5);
  });
});

describe('isCellMark — what counts as a marker', () => {
  it('accepts the two shapes and nothing else', () => {
    expect(isCellMark({ $: [0, 1] })).toBe(true);
    expect(isCellMark({ $f: [0, 1] })).toBe(true);
    expect(isCellMark(null)).toBe(false);
    expect(isCellMark(7)).toBe(false);
    expect(isCellMark({ id: 1 })).toBe(false);
    // A pair is a pair: an address of any other length is data that happens to sit under
    // the same key, and reading it as one would resolve a slot nobody meant to share.
    expect(isCellMark({ $: [0] })).toBe(false);
    expect(isCellMark({ $: 'nope' })).toBe(false);
  });
});
