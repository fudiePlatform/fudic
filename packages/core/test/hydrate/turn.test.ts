import { describe, it, expect } from 'vitest';
import {
  idOf,
  instanceById,
  instancesOf,
  openTurn,
} from '../../src/hydrate/registry.js';
import { host, publish } from './_page.js';

/**
 * One walk per gesture, and not one per tag (SDD-45 §4.11).
 *
 * The index is opened in `raise` — the single entrance of path 2 — and closed in its
 * `finally`. What these tests hold is the reason it is PER TURN and not global: a global one
 * would have to be kept alive against everything that inserts nodes afterwards (the
 * fabricator in `live`, the worker's render, the user's own script), and a stale index is a
 * silent wrong answer where today there is a slow correct one. This one is born with the
 * gesture and dies with it, so it cannot age.
 *
 * And the invariant it may not touch: the ORDER of `instancesOf` is SDD-17's, because the
 * cascade and the handout both depend on it. The index is built from the same shadow-inclusive
 * pre-order walk and a `Map` keeps insertion order, so the order is copied, never recomputed.
 */

describe('the turn index', () => {
  it('answers by tag and by id from the index, with SDD-17’s order untouched', () => {
    publish();
    const outer = host('turn-outer', 0);
    host('turn-inner', 1, outer.shadowRoot!);
    host('turn-inner', 2, outer.shadowRoot!);
    host('turn-inner', 3);

    // The same two questions, asked outside a turn and then inside one. Identical answers is
    // the whole contract: the index is an accelerator, never a second source of truth.
    const walked = instancesOf('turn-inner', document).map(idOf);
    const close = openTurn(document);
    try {
      expect(instancesOf('turn-inner', document).map(idOf)).toEqual(walked);
      expect(instancesOf('turn-inner', document).map(idOf)).toEqual([1, 2, 3]);
      expect(instanceById(2, document)).toBe(instancesOf('turn-inner', document)[1]);
      // A tag nobody rendered: an empty list from the index, exactly as the walk answers.
      expect(instancesOf('turn-absent', document)).toEqual([]);
      // And an id nobody carries.
      expect(instanceById(99, document)).toBeUndefined();
    } finally {
      close();
    }

    // Closed: the finders walk again, and answer the same.
    expect(instancesOf('turn-inner', document).map(idOf)).toEqual(walked);
  });

  it('a finder asked about ANOTHER root walks instead of answering from the wrong tree', () => {
    publish();
    const outer = host('turn-root', 0);
    host('turn-leaf', 1, outer.shadowRoot!);
    host('turn-leaf', 2);

    const close = openTurn(document);
    try {
      // The index carries the root it was built for. Asked about the shadow tree of `outer`,
      // it declines and walks — otherwise it would hand back the document's two instances for
      // a subtree that holds one.
      expect(instancesOf('turn-leaf', outer.shadowRoot!).map(idOf)).toEqual([1]);
      expect(instanceById(2, outer.shadowRoot!)).toBeUndefined();
      // And the root it IS about still answers from the index.
      expect(instancesOf('turn-leaf', document).map(idOf)).toEqual([1, 2]);
    } finally {
      close();
    }
  });

  it('two overlapping gestures: closing clears only its own index', () => {
    publish();
    host('turn-a', 0);

    // The first gesture is awaiting its chunk when the second starts. The second's index is a
    // FRESHER snapshot of the same tree, so it answers the first correctly too — and that is
    // why closing the first must not restore anything.
    const closeFirst = openTurn(document);
    host('turn-a', 1);
    const closeSecond = openTurn(document);

    expect(instancesOf('turn-a', document).map(idOf)).toEqual([0, 1]);

    // The first gesture finishes. Restoring its older index here would be the only way to
    // hand the second gesture something stale, so it clears nothing.
    closeFirst();
    expect(instancesOf('turn-a', document).map(idOf)).toEqual([0, 1]);

    // The node added after the second index was taken is invisible to it — that is what a
    // snapshot is, and what a gesture-long life makes harmless.
    host('turn-a', 2);
    expect(instancesOf('turn-a', document).map(idOf)).toEqual([0, 1]);

    // And once the last turn closes, the finders walk and see everything again.
    closeSecond();
    expect(instancesOf('turn-a', document).map(idOf)).toEqual([0, 1, 2]);
  });
});
