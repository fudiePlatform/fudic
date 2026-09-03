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
 * The four assertions are `it.fails` on purpose. They have to be seen failing, and they have
 * to leave the workspace green while they do, so that the day the cell lands the only edit
 * is `it.fails` → `it` and the diff itself is the proof. What each of them does today:
 *
 *  1. `expected +0 to be { $: [ 0, 1 ] }` — the child holds the MARKER, a plain JSON object,
 *     while the parent holds the `0` that sat in its own slot: `$p1 ?? signal(start)` gives
 *     back the number, because nothing turned that slot into anything else. Two different
 *     things, never mind two objects.
 *  2. the same reading, one level further down: the grandchild holds a second copy of that
 *     marker.
 *  3. `TypeError: child.value.set is not a function` — a marker has no `set`.
 *  4. `TypeError: this.onSave is not a function` — nor is a marker callable, so neither
 *     owner is ever reached.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createCascade, type Cascade } from '../../src/hydrate/cascade.js';
import { createChunkLoader } from '../../src/hydrate/chunks.js';
import { readPageMaps } from '../../src/hydrate/maps.js';
import { instanceState } from '../../src/hydrate/registry.js';
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
  const cascade = createCascade({
    maps: readPageMaps(document),
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
      cascade.attachAll(tag);
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

  it.fails('the same object: parent.count IS child.value', async () => {
    const { parent, child } = publishTree();
    const h = harness();
    await h.raise('cell-parent');

    expect((parent as CellParent).count).toBe((child as CellConsumer).value);
  });

  it.fails('and the grandchild holds it too, three levels down', async () => {
    const { parent, kid } = publishTree();
    const h = harness();
    await h.raise('cell-parent');

    expect((parent as CellParent).count).toBe((kid as CellConsumer).value);
  });

  it.fails('a write from below reaches an owner that was still cold', async () => {
    const { parent, child } = publishTree();
    const h = harness();
    // Only the child: the owner has not been defined, upgraded or handed anything.
    await h.raise('cell-child');

    ((child as CellConsumer).value as Signal<number>).set(7);

    await h.raise('cell-parent');
    expect((parent as CellParent).count()).toBe(7);
  });

  it.fails('two forms with different owners call each its own', async () => {
    const { forms, owners } = publishTwoOwners();
    const h = harness();
    await h.raise('cell-parent');

    forms[0]!.submit('first');
    forms[1]!.submit('second');

    expect(owners[0]!.saved).toEqual(['first']);
    expect(owners[1]!.saved).toEqual(['second']);
  });
});
