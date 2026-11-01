// Driven end to end over the page the runtime reads, with chunks that do what compiled
// components do. Nothing is faked at the seam under test: whether parent and child end up
// holding the same object.

import { describe, it, expect, beforeEach } from 'vitest';
import { createCells, isCellMark } from '../../src/hydrate/cells.js';
import { installHydration } from '../../src/hydrate/install.js';
import { readPageMaps } from '../../src/hydrate/maps.js';
import { idOf, instancesOf } from '../../src/hydrate/instances.js';
import { signal, type Signal } from '../../src/signal.js';
import {
  cascadeHarness,
  deferred,
  defineRecorder,
  host,
  publish,
  settle,
  TestRegistry,
  type CascadeHarness,
  type Recorder,
} from './_page.js';

/**
 * The owner: a `start` prop, then its two cells, a signal and a callback, after the props.
 * No class fields: an upgrade here swaps the prototype without calling the constructor.
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
    // The owner fills the function cell it reserved.
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

/** A child with a callback prop: it reads the cell when it calls. */
class CellForm extends HTMLElement {
  onSave!: Signal<(what: unknown) => void>;

  h(props: readonly unknown[]): void {
    this.onSave = props[0] as Signal<(what: unknown) => void>;
  }

  submit(what: unknown): void {
    this.onSave()(what);
  }
}

/** Both ends at once: it receives a callback from its owner and hands one to its child. */
class CellRelay extends HTMLElement {
  h(props: readonly unknown[]): void {
    const [onSave, $p1] = props as [Signal<(what: unknown) => void>, Signal<unknown>];
    $p1.set((what: unknown): void => {
      onSave()(what);
    });
  }
}

const CHUNKS: Readonly<Record<string, CustomElementConstructor>> = {
  'cell-parent': CellParent,
  'cell-child': CellConsumer,
  'cell-kid': CellConsumer,
  'cell-form': CellForm,
  'cell-relay': CellRelay,
};

interface Harness extends CascadeHarness {
  /** What a click on `tag` does, minus the event listeners, which no component here has. */
  raise(tag: string): Promise<void>;
}

function harness(): Harness {
  const h = cascadeHarness((registry, tag) => {
    registry.define(tag, CHUNKS[tag]!);
  });
  return {
    ...h,
    async raise(tag: string): Promise<void> {
      await h.cascade.raise(tag);
      // What hydration reports for the clicked host.
      for (const el of instancesOf(tag, document)) {
        h.reported.push(`downloaded:${tag}#${idOf(el)}`);
      }
    },
  };
}

/**
 * An owner whose shadow holds a child (which holds a grandchild) and a form.
 *
 *     [[0,3,4,5,6],[ 0, 0, null, {"$":[0,1]}, {"$":[0,1]}, {"$f":[0,2]} ]]
 *
 * Instance 0 is `[ start=0, count=0, save=null ]`: a function is serialized as `null`.
 * Markers always point backwards, because the server numbers in pre-order.
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
    // The owner's slot holds a value, not a marker: without the sweep it would get the plain
    // `0` and the child a second cell.
    const { parent, child } = publishTree();
    const h = harness();
    h.registry.define('cell-parent', CellParent);
    h.cascade.attachAll('cell-parent');
    await h.raise('cell-child');

    expect((parent as CellParent).count).toBe((child as CellConsumer).value);
    expect((parent as CellParent).count()).toBe(0);
  });

  it('an empty cell raises its owner, and the owner brings its subtree', async () => {
    const { parent, form } = publishTree();
    const h = harness();
    // The form's owner is an ancestor, outside the form's subtree, and still cold.
    await h.raise('cell-form');

    // The owner hands every child its state, so its whole subtree comes up before it.
    expect(h.reported).toEqual([
      'subtree:cell-kid#2',
      'subtree:cell-child#1',
      'subtree:cell-form#3',
      'subtree:cell-parent#0',
      'downloaded:cell-form#3',
    ]);
    // The form got its state before its owner ran, and the cell is read when called.
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

  it('a chain of owners comes up whole: the owner of the owner too', async () => {
    publish({
      tree: { 'cell-parent': ['cell-relay'], 'cell-relay': ['cell-form'] },
      state: [
        [0, 3, 5, 6],
        [0, 0, null, { $f: [0, 2] }, null, { $f: [1, 1] }],
      ],
    });
    const parent = host('cell-parent', 0);
    const relay = host('cell-relay', 1, parent.shadowRoot!);
    const form = host('cell-form', 2, relay.shadowRoot!);
    const h = harness();
    await h.raise('cell-form');

    expect(h.reported).toEqual([
      'subtree:cell-form#2',
      'subtree:cell-relay#1',
      'subtree:cell-parent#0',
      'downloaded:cell-form#2',
    ]);
    (form as CellForm).submit('deep');
    expect((parent as CellParent).saved).toEqual(['deep']);
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
    const cells = createCells(readPageMaps(document), signal);
    expect(cells.resolve(0)).toEqual([1, 'two', null, { id: 3 }]);
  });

  it('an instance with no `$f` depends on nobody', () => {
    publish({ state: [[0, 2, 3], [0, 0, { $: [0, 1] }]] });
    const cells = createCells(readPageMaps(document), signal);
    expect(cells.eager(1)).toEqual([]);
    expect(cells.eager(0)).toEqual([]);
  });

  it('clear() empties it, so a second visit starts from the new payload', () => {
    publish({ state: [[0, 2, 3], [0, 7, { $: [0, 1] }]] });
    const cells = createCells(readPageMaps(document), signal);
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

describe('installHydration', () => {
  it('hands back the cells the page hydrated with', async () => {
    publish({ state: [[0, 2, 3], [0, 5, { $: [0, 1] }]], eager: ['cell-parent'] });
    const parent = host('cell-parent', 0);
    const registry = new TestRegistry();
    const { cells } = installHydration({
      root: document,
      document,
      registry,
      resolveChunk: (tag) => tag,
      importModule: async (tag) => {
        defineRecorder(registry, tag, []);
      },
      importDeferred: deferred,
    });
    await settle();

    expect((parent as Recorder).slice?.[1]).toBe(cells.get([0, 1]));
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
