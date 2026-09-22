import { describe, expect, it } from 'vitest';

import { installPage } from '../src/page.js';
import { injectFrom, token } from '../src/index.js';
import type { Container } from '../src/types.js';

/**
 * What starting a route's injection does, and where it does it (SDD-45 §4.4, §1.5 rule 3).
 *
 * The loop lives in this package and not in the generated coordinator, so this is the suite
 * that holds it: a coordinator may carry the folder and the build id of its application, and
 * fetching one module per owning tag is neither — it is identical for every app that injects.
 * Measured, it was also most of the coordinator's weight, because a dynamic `import()` in
 * application code drags the app bundler's preload helper with it.
 *
 * And not a line here names `document`. The map arrives PARSED: where a page keeps its two
 * blocks is the page's business, and the one who reads them is the coordinator.
 */

/** The resolver an application hands in: one URL per owning tag, derived its own way. */
const resolveChunk = (name: string): string =>
  new URL(`./fixtures/${name}.js`, import.meta.url).href;

/** What the fixture recorded, so a second test does not read the first one's marks. */
type Fixture = { readonly registered: string[] };
const marksOf = async (name: string): Promise<string[]> =>
  ((await import(resolveChunk(name))) as Fixture).registered;

describe('installPage', () => {
  it('fetches one module per owning tag and registers it in that tag’s container', async () => {
    const tree = await installPage({
      map: [
        [-1, 0, 1],
        ['cart', '', 'panel'],
      ],
      resolveChunk,
    });

    expect(tree).toHaveLength(3);
    // Node 0 is the root and node 2 hangs from node 1: each owner saw its own container and
    // no other. The middle node owns nothing, so nobody was asked for a module for it.
    expect(await marksOf('cart.ioc')).toEqual([(tree[0] as Container).label]);
    expect(await marksOf('panel.ioc')).toEqual([(tree[2] as Container).label]);
  });

  it('asks once for a tag that owns three nodes', async () => {
    const asked: string[] = [];
    const tree = await installPage({
      map: [
        [-1, 0, 0, 0],
        ['', 'dup', 'dup', 'dup'],
      ],
      resolveChunk: (name) => {
        asked.push(name);
        return resolveChunk('cart.ioc');
      },
    });

    // Deduped before the fetch: a tag that owns three nodes is still one module, and it is
    // the SET that is fetched rather than the list.
    expect(asked).toEqual(['dup.ioc']);
    // But it registers into each of the three containers it owns.
    expect(tree).toHaveLength(4);
  });

  it('asks for nothing when no node owns a tag, and still builds the tree', async () => {
    const asked: string[] = [];
    const tree = await installPage({
      map: [
        [-1, 0],
        ['', ''],
      ],
      resolveChunk: (name) => {
        asked.push(name);
        return resolveChunk('cart.ioc');
      },
    });

    // The empty tag is the map's way of saying "this node owns nothing": a page that
    // publishes a map because it has nodes, and no owner in it, fetches zero modules.
    expect(asked).toEqual([]);
    expect(tree).toHaveLength(2);
  });

  it('treats a node the tag block does not reach as owning nothing', async () => {
    // The two blocks are emitted together and agree, so this is the honest reading of a
    // disagreement rather than a path the compiler produces: a node with no tag written for
    // it owns nothing, which is the same thing an empty tag says. It is a container built
    // and left alone, never a module fetched for `undefined`.
    const tree = await installPage({
      map: [[-1, 0], ['']],
      resolveChunk: () => {
        throw new Error('nothing should be fetched');
      },
    });

    expect(tree).toHaveLength(2);
  });

  it('gives the root the seed the route published', async () => {
    const LOCALE = token<string>('locale');
    const tree = await installPage({
      map: [[-1], ['']],
      resolveChunk,
      seed: { locale: 'es-ES' },
    });

    expect(injectFrom(tree[0] as Container, LOCALE)).toBe('es-ES');
  });
});
