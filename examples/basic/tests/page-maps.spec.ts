/**
 * What the page TELLS the runtime, read off a real browser — and nothing else.
 *
 * `/mapas` is prerendered by the build, so what arrives is bytes on disk: the three
 * `application/json` blocks at the end of the body, the `data-fud-id` of every hydratable
 * host, and no component JavaScript at all. This spec only READS. It never clicks, never
 * waits for a chunk and never expects an element to be upgraded — the hydration runtime is
 * SDD-17 and does not exist yet.
 *
 * That last point is the one worth a test: the invariant this batch must not break by
 * accident is that a page with maps is still a ZERO-JS page. `:not(:defined)` listing every
 * custom element of the document is the browser's own way of saying so.
 */

import { test, expect } from '@playwright/test';

interface Snapshot {
  readonly ids: number[];
  readonly undefinedTags: string[];
  readonly navHasId: boolean;
  readonly pickerHasShadow: boolean;
}

/**
 * What the DOM says, shadow roots included — because most instances that carry an id live
 * INSIDE one. `document.querySelectorAll` stops at the boundary, and the three `bus-option`
 * a `bus-picker` mounts are exactly the children `fud-tree` maps: the ones of the shadow,
 * never the ones of light. Walking host-then-shadow-then-siblings is the same pre-order the
 * server assigned the ids in, which is why comparing them is meaningful at all.
 */
function snapshot(page: import('@playwright/test').Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const all: Element[] = [];
    const walk = (root: Document | ShadowRoot): void => {
      for (const el of root.querySelectorAll('*')) {
        all.push(el);
        if (el.shadowRoot !== null) walk(el.shadowRoot);
      }
    };
    walk(document);
    return {
      ids: all
        .filter((el) => el.hasAttribute('data-fud-id'))
        .map((el) => Number(el.getAttribute('data-fud-id'))),
      undefinedTags: [
        ...new Set(all.filter((el) => el.matches(':not(:defined)')).map((el) => el.localName)),
      ].sort(),
      navHasId: document.querySelector('site-nav')?.hasAttribute('data-fud-id') === true,
      pickerHasShadow: document.querySelector('bus-picker')?.shadowRoot !== null,
    };
  });
}

/** The parsed content of one block, or `undefined` when the page does not publish it. */
function block(page: import('@playwright/test').Page, id: string): Promise<unknown> {
  return page.evaluate((blockId) => {
    const el = document.getElementById(blockId);
    return el === null ? undefined : (JSON.parse(el.textContent ?? '') as unknown);
  }, id);
}

test.describe('the page publishes its maps', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/mapas');
  });

  test('the three blocks travel inside the document, at the end of the body', async ({ page }) => {
    const where = await page.evaluate(() =>
      ['fud-state', 'fud-tree', 'fud-bus'].map((id) => {
        const el = document.getElementById(id);
        return el === null
          ? null
          : { type: el.getAttribute('type'), inBody: el.parentElement === document.body };
      }),
    );
    for (const entry of where) {
      expect(entry).not.toBeNull();
      expect(entry?.type).toBe('application/json');
      expect(entry?.inBody).toBe(true);
    }
  });

  test('the ids are correlative in pre-order, and the offsets close on the data', async ({
    page,
  }) => {
    // `bus-picker`, the three `bus-option` its shadow holds, then `bus-log`.
    const { ids } = await snapshot(page);
    expect(ids).toEqual([0, 1, 2, 3, 4]);

    const [offsets, data] = (await block(page, 'fud-state')) as [number[], unknown[]];
    expect(offsets).toHaveLength(ids.length + 1);
    expect(offsets[0]).toBe(0);
    expect(offsets.at(-1)).toBe(data.length);
    // Each option carries the two props it was painted with, in the order it declares them.
    expect(data.slice(offsets[1], offsets[2])).toEqual(['Declarative Shadow DOM', true]);
  });

  test('a host with nothing of its own carries no id, and its tag has no slice', async ({
    page,
  }) => {
    // `site-nav` comes from the layout: props, no reactive of its own, nothing crossing in.
    const { navHasId } = await snapshot(page);
    expect(navHasId).toBe(false);
    expect(await block(page, 'fud-tree')).not.toHaveProperty('site-nav');
  });

  test('the static maps are composition, not instances', async ({ page }) => {
    // Three options in the document, one entry here: the map is tag→tags.
    expect(await block(page, 'fud-tree')).toEqual({ 'bus-picker': ['bus-option'] });
    // Who emits depends on who listens, and the name of the event never travels.
    expect(await block(page, 'fud-bus')).toEqual({ 'bus-picker': ['bus-log'] });
  });

  test('SDD-17 §5 still zero component JavaScript: everything is `:not(:defined)`', async ({
    page,
  }) => {
    const { undefinedTags, pickerHasShadow } = await snapshot(page);
    expect(undefinedTags).toEqual(['bus-log', 'bus-option', 'bus-picker', 'site-nav']);
    // And the document is painted anyway, because the shadow roots are declarative.
    expect(pickerHasShadow).toBe(true);
  });
});
