/**
 * SDD-63 §3.5 and §4.4 — «find all references» over a component tag, the library a card
 * names, and the package name it is read from.
 *
 * Over an index held in memory: the uses come from what the index already read, so no program
 * and no server are needed to measure them.
 */

import { describe, expect, it } from 'vitest';
import { DocumentCache } from '../../src/document-cache.js';
import { WorkspaceIndex } from '../../src/workspace-index.js';
import { tagReferencesAt } from '../../src/services/references.js';
import { tagCardAt } from '../../src/services/tag-card.js';
import { component, LAYOUT, memoryFs, MONOREPO, TIENDA_ROUTE } from '../_support.js';

const CARD = '/p/components/app-card.fud';
const HOME = '/p/home.fud';
const ABOUT = '/p/about.fud';

const ROUTE = (body: string): string =>
  `<link rel="layout" href="./_layout.fud">\n<link rel="component" href="./components/app-card.fud">\n${body}\n`;

/** An index over `files` and the cached document of `path`. */
function setup(files: Record<string, string>, path: string) {
  const index = new WorkspaceIndex(memoryFs(files));
  index.scan('/p');
  const source = files[path]!;
  return { files, index, cached: new DocumentCache(index).get(path, 1, source), source };
}

const WORKSPACE = (): Record<string, string> => ({
  [CARD]: component('app-card'),
  '/p/_layout.fud': LAYOUT,
  [HOME]: ROUTE('<app-card></app-card>\n<p>x</p>\n<app-card></app-card>'),
  [ABOUT]: ROUTE('<app-card></app-card>\n<app-ghost></app-ghost>'),
});

describe('tagReferencesAt', () => {
  it('lists every use of the tag, ordered by path and position, with the text of its file', () => {
    const { cached, index, source, files } = setup(WORKSPACE(), HOME);
    const refs = tagReferencesAt(cached, index, source.indexOf('<app-card') + 2);

    expect(refs?.map((ref) => ref.path)).toEqual([ABOUT, HOME, HOME]);
    for (const ref of refs ?? []) {
      expect(ref.text.slice(ref.span.start, ref.span.end)).toBe('app-card');
    }
    expect(refs?.[0]?.text).toBe(files[ABOUT]);
  });

  it("reads the open document's own text rather than the disk", () => {
    const files = WORKSPACE();
    const { index } = setup(files, HOME);
    // The buffer has a use the disk does not have yet: the editor shows the buffer.
    const edited = `${files[HOME]!}<app-card></app-card>\n`;
    const cached = new DocumentCache(index).get(HOME, 2, edited);
    const refs = tagReferencesAt(cached, index, edited.indexOf('<app-card') + 2);

    expect(refs?.filter((ref) => ref.path === HOME).every((ref) => ref.text === edited)).toBe(true);
  });

  it("answers on the component's own host tag too", () => {
    const { cached, index, source } = setup(WORKSPACE(), CARD);

    expect(tagReferencesAt(cached, index, source.indexOf('<app-card') + 2)?.length).toBe(3);
  });

  it('leaves out a file that can no longer be read', () => {
    const { cached, index, source, files } = setup(WORKSPACE(), HOME);
    delete files[ABOUT];

    expect(tagReferencesAt(cached, index, source.indexOf('<app-card') + 2)?.map((ref) => ref.path)).toEqual([
      HOME,
      HOME,
    ]);
  });

  it('answers nothing off a tag, on a native element, or for a tag nobody defines', () => {
    const { cached, index, source } = setup(WORKSPACE(), ABOUT);

    expect(tagReferencesAt(cached, index, source.indexOf('rel=') + 1)).toBeUndefined();
    const native = setup({ ...WORKSPACE(), [HOME]: ROUTE('<p>x</p>') }, HOME);
    expect(tagReferencesAt(native.cached, native.index, native.source.indexOf('<p') + 1)).toBeUndefined();
    expect(tagReferencesAt(cached, index, source.indexOf('<app-ghost') + 2)).toBeUndefined();
  });
});

describe('the library a card names', () => {
  const ROUTE_WITH_CARD = '/ws/apps/tienda/src/routes/index.fud';

  /** `tienda` swept on its own, so `@acme/ui` is reached as a library. */
  function tienda(files: Readonly<Record<string, string>> = MONOREPO) {
    const source = `${files[TIENDA_ROUTE]!}<ui-card></ui-card>\n<tienda-card></tienda-card>\n`;
    const index = new WorkspaceIndex(memoryFs({ ...files, [ROUTE_WITH_CARD]: source }));
    index.scan('/ws/apps/tienda');
    return { index, cached: new DocumentCache(index).get(ROUTE_WITH_CARD, 1, source), source };
  }

  it("is the package of a library's component", () => {
    const { index, cached, source } = tienda();

    expect(tagCardAt(cached, index, source.indexOf('<ui-card') + 2)?.library).toBe('@acme/ui');
  });

  it("is nothing for the project's own component", () => {
    const { index, cached, source } = tienda();

    expect(tagCardAt(cached, index, source.indexOf('<tienda-card') + 2)).not.toHaveProperty('library');
  });

  it('is nothing for a library whose package.json has no name', () => {
    const { index, cached, source } = tienda({
      ...MONOREPO,
      '/ws/node_modules/@acme/ui/package.json': JSON.stringify({
        exports: { './ui-card.fud': './src/ui-card.fud' },
      }),
    });

    expect(tagCardAt(cached, index, source.indexOf('<ui-card') + 2)).not.toHaveProperty('library');
  });
});

describe('WorkspaceIndex.packageNameOf', () => {
  const index = new WorkspaceIndex(
    memoryFs({
      ...MONOREPO,
      '/ws/plain/package.json': JSON.stringify({ name: '@acme/plain' }),
      '/ws/plain/x.fud': component('x-y'),
    }),
  );

  it('is the name of the package a file belongs to', () => {
    expect(index.packageNameOf('/ws/node_modules/@acme/ui/src/ui-card.fud')).toBe('@acme/ui');
  });

  it('is nothing outside any package', () => {
    expect(index.packageNameOf('/elsewhere/x.fud')).toBeUndefined();
  });

  it('is nothing for a package that is not a fudic one', () => {
    // No `fudic.json`: the dependency walk lists nothing to name.
    expect(index.packageNameOf('/ws/plain/x.fud')).toBeUndefined();
  });
});
