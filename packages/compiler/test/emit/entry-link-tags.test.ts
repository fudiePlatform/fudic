/**
 * BUG-32 T6 — `entryLinkTags`: which tag each `<link rel="component">` of the entry declares.
 *
 * A `<link>` carries a PATH and a component carries its identity in its root tag (decision
 * 75), so the two coincide only by convention and the question can be answered nowhere but
 * in the resolver — that is where the files were read. It is what lets the unused-link rule
 * point at a declaration nobody uses without resolving a path of its own.
 *
 * The case worth a test of its own is the SHARED dependency. `visitComponents` returns early
 * for a component already in the map, and if the path→tag entry were written after that
 * guard, the second link to the same file would have no answer: the rule would then report a
 * link that is perfectly well used.
 */

import { describe, expect, it } from 'vitest';
import { resolveComponents, linkHref } from '../../src/emit/index.js';
import { LINK_LAYOUT, memoryIo } from './_support.js';

const BADGE = `<app-badge>
  <template shadowrootmode="open"><span><slot></slot></span></template>
</app-badge>
`;

/** A component `tag` that links `hrefs` and uses each `uses` tag in its shadow. */
const component = (tag: string, hrefs: readonly string[], uses: string): string =>
  `${hrefs.map((h) => `<link rel="component" href="${h}">`).join('\n')}
<${tag}>
  <template shadowrootmode="open">${uses}</template>
</${tag}>
`;

/** The entry's link map as `[href, tag]` pairs, which is what the assertions read. */
function tagsOf(files: Record<string, string>, entry = '/page.fud'): readonly (readonly [string, string])[] {
  const graph = resolveComponents(entry, memoryIo(files));
  return [...graph.entryLinkTags].map(([link, tag]) => [linkHref(link)!, tag] as const);
}

describe('entryLinkTags — the path a link carries, resolved to the tag it declares', () => {
  it('maps each link of the entry to the tag of the file it points at', () => {
    expect(
      tagsOf({
        '/page.fud': `${LINK_LAYOUT}<link rel="component" href="./app-badge.fud">\n<app-badge>hi</app-badge>\n`,
        '/app-badge.fud': BADGE,
      }),
    ).toEqual([['./app-badge.fud', 'app-badge']]);
  });

  it('answers for BOTH links when two of them reach the same shared dependency', () => {
    // The guard in `visitComponents` returns early the second time the badge is reached. The
    // path→tag entry is written BEFORE it, so the second link still gets its answer — without
    // that, a link that IS used would be reported as dead.
    const pairs = tagsOf({
      '/page.fud':
        LINK_LAYOUT +
        '<link rel="component" href="./app-badge.fud">' +
        '<link rel="component" href="./app-card.fud">' +
        '\n<app-badge>hi</app-badge><app-card></app-card>\n',
      // The card reaches the badge too: by the time the page's own second link is looked up,
      // the badge is long since in `components`.
      '/app-card.fud': component('app-card', ['./app-badge.fud'], '<app-badge>inner</app-badge>'),
      '/app-badge.fud': BADGE,
    });
    expect(pairs).toEqual([
      ['./app-badge.fud', 'app-badge'],
      ['./app-card.fud', 'app-card'],
    ]);
  });

  it('is keyed by the link element, so two links to one file are two entries', () => {
    const graph = resolveComponents(
      '/page.fud',
      memoryIo({
        '/page.fud':
          LINK_LAYOUT +
          '<link rel="component" href="./app-badge.fud">' +
          '<link rel="component" href="./app-badge.fud">' +
          '\n<app-badge>hi</app-badge>\n',
        '/app-badge.fud': BADGE,
      }),
    );
    expect(graph.entryLinkTags.size).toBe(2);
    expect([...new Set(graph.entryLinkTags.values())]).toEqual(['app-badge']);
  });

  it('leaves out a link whose file is not a component: it declares no tag', () => {
    expect(
      tagsOf({
        '/page.fud': `${LINK_LAYOUT}<link rel="component" href="./other.fud">\n<p>x</p>\n`,
        // A layout: a `.fud` all the same, and no component.
        '/other.fud': '<!DOCTYPE html><html><head>@RenderHead()</head><body>@RenderBody()</body></html>',
      }),
    ).toEqual([]);
  });

  it('leaves out a link with no href at all', () => {
    expect(
      tagsOf({
        '/page.fud': `${LINK_LAYOUT}<link rel="component">\n<p>x</p>\n`,
      }),
    ).toEqual([]);
  });

  it('answers about the ENTRY alone: a dependency’s own links are not in it', () => {
    // The map exists to give a diagnostic a span in the file being compiled. A link inside
    // `app-card` belongs to `app-card`'s own compilation, not to the page's.
    expect(
      tagsOf({
        '/page.fud': `${LINK_LAYOUT}<link rel="component" href="./app-card.fud">\n<app-card></app-card>\n`,
        '/app-card.fud': component('app-card', ['./app-badge.fud'], '<app-badge>inner</app-badge>'),
        '/app-badge.fud': BADGE,
      }),
    ).toEqual([['./app-card.fud', 'app-card']]);
  });

  it('is empty for an entry that links nothing', () => {
    const graph = resolveComponents(
      '/page.fud',
      memoryIo({ '/page.fud': `${LINK_LAYOUT}<p>x</p>\n` }),
    );
    expect(graph.entryLinkTags.size).toBe(0);
  });
});
