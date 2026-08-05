/**
 * SDD-28 criterion 13 — the editor and `fudic g component --in` write the same `<link>`.
 *
 * It can only be checked here, because this is the only place both paths exist. Since phase 0
 * they share the rule itself (`componentLinkAnchor`, `alreadyLinked`, both the compiler's), so
 * what this test guards is the other half: the two APPLICATIONS of it, an LSP insertion on one
 * side and a splice over a string on the other. A divergence there would mean the same
 * component lands one line off depending on whether it was linked from the editor or from the
 * terminal.
 */

import { describe, expect, it } from 'vitest';
import { parseFud, wireComponentLink } from '@fudic/cli';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { linkInsertionFor } from '../../src/services/tags.js';
import { component, LAYOUT, memoryFs, PAGE, route } from '../_support.js';

const HREF = '../components/app-badge.fud';

/** What the editor ends up with: the insertion applied to the source. */
function editorWrites(path: string, source: string, href: string): string | null {
  const index = new WorkspaceIndex(memoryFs({ [path]: source }));
  index.scan('/p');
  const document = new DocumentCache(index).get(path, 1, source);

  const insertion = linkInsertionFor(document, href);
  if (insertion === undefined) return null;
  return source.slice(0, insertion.span.start) + insertion.newText + source.slice(insertion.span.end);
}

/** What `fudic g component --in` ends up with. */
function cliWrites(source: string, href: string): string | null {
  return wireComponentLink(source, parseFud(source).doc, href);
}

const CORPUS: readonly (readonly [string, string, string, string])[] = [
  ['a component with no links', '/p/components/app-card.fud', component('app-card'), './app-badge.fud'],
  [
    'a component that already links something else',
    '/p/components/app-card.fud',
    component('app-card', ['./site-nav.fud']),
    './app-badge.fud',
  ],
  ['a route with only its layout', '/p/blog/[slug].fud', route('../layouts/_layout.fud'), HREF],
  [
    'a route that already links a component',
    '/p/blog/[slug].fud',
    route('../layouts/_layout.fud', ['../components/site-nav.fud']),
    HREF,
  ],
  ['a standalone page', '/p/about.fud', PAGE, './components/app-badge.fud'],
  ['a layout', '/p/layouts/_layout.fud', LAYOUT, '../components/app-badge.fud'],
];

describe('the editor and the CLI write the same link', () => {
  it.each(CORPUS.map(([label, path, source, href]) => [label, path, source, href] as const))(
    '%s',
    (_label, path, source, href) => {
      const fromEditor = editorWrites(path, source, href);

      expect(fromEditor).toBe(cliWrites(source, href));
      // And it is a real write, not two agreeing on nothing.
      expect(fromEditor).toContain(`href="${href}"`);
    },
  );

  it('and both refuse to write it twice', () => {
    const source = route('../layouts/_layout.fud', [HREF]);

    expect(editorWrites('/p/blog/[slug].fud', source, HREF)).toBeNull();
    expect(cliWrites(source, HREF)).toBeNull();
  });
});
