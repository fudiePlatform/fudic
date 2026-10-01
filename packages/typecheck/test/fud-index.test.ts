/**
 * The index of a project's `.fud` (SDD-24 §4.5, SDD-35 §4.2) and the three facts it reads off
 * each one: the tag, the holes of a layout, the layout a route names.
 *
 * Maintained per file, never rebuilt: the revision is what a projection cache keys by, so it
 * must move exactly when the set of files does.
 */

import { describe, expect, it } from 'vitest';
import { describeFud, FudIndex, holesOf, layoutHrefOf, parseFud, tagOf } from '../src/index.js';
import { component, LAYOUT, memoryFs, PAGE, route } from './_support.js';

const FILES: Record<string, string> = {
  '/p/components/app-badge.fud': component('app-badge'),
  '/p/layouts/_layout.fud': LAYOUT,
  '/p/routes/index.fud': route('../layouts/_layout.fud'),
  '/p/notes.txt': 'not a .fud',
};

const LIBRARY: Record<string, string> = {
  '/p/package.json': JSON.stringify({ name: 'app', dependencies: { '@acme/ui': '1.0.0' } }),
  '/p/node_modules/@acme/ui/package.json': JSON.stringify({ name: '@acme/ui' }),
  '/p/node_modules/@acme/ui/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui' }),
  '/p/node_modules/@acme/ui/ui-card.fud': component('ui-card'),
};

function indexOver(files: Record<string, string>): FudIndex {
  const index = new FudIndex(memoryFs(files), describeFud);
  index.scan('/p');
  return index;
}

describe('FudIndex', () => {
  it('sweeps the project and describes each file', () => {
    const index = indexOver(FILES);

    expect(index.all().map((entry) => entry.path)).toEqual([
      '/p/components/app-badge.fud',
      '/p/layouts/_layout.fud',
      '/p/routes/index.fud',
    ]);
    expect(index.get('/p/components/app-badge.fud')).toMatchObject({ tag: 'app-badge', external: false });
    expect(index.get('/p/layouts/_layout.fud')?.holes.renderBody).toBeDefined();
  });

  it("adds a library's files, marked external", () => {
    const fs = memoryFs({ ...FILES, ...LIBRARY });
    // The project sweep prunes node_modules; the library is reached by its dependency graph.
    const index = new FudIndex(
      { ...fs, fudFiles: (root) => fs.fudFiles(root).filter((path) => !path.slice(root.length).includes('/node_modules/')) },
      describeFud,
    );
    index.scan('/p');

    expect(index.get('/p/node_modules/@acme/ui/ui-card.fud')).toMatchObject({ tag: 'ui-card', external: true });
    expect(index.get('/p/components/app-badge.fud')?.external).toBe(false);
  });

  it('resolves an href to the entry it points at, and nothing for a file it does not hold', () => {
    const index = indexOver(FILES);

    expect(index.resolve('/p/routes/index.fud', '../components/app-badge.fud')?.tag).toBe('app-badge');
    expect(index.resolve('/p/routes/index.fud', '../components/ghost.fud')).toBeUndefined();
  });

  it('moves the revision on every read and on a removal that removed something', () => {
    const files = { ...FILES };
    const index = indexOver(files);
    const start = index.revision;

    index.upsert('/p/components/app-badge.fud');
    expect(index.revision).toBe(start + 1);

    index.remove('/p/components/ghost.fud');
    expect(index.revision).toBe(start + 1);

    index.remove('/p/components/app-badge.fud');
    expect(index.revision).toBe(start + 2);
    expect(index.get('/p/components/app-badge.fud')).toBeUndefined();
  });

  it('drops a file that cannot be read instead of keeping it stale', () => {
    const files: Record<string, string> = { ...FILES };
    const index = indexOver(files);

    delete files['/p/components/app-badge.fud'];
    index.upsert('/p/components/app-badge.fud');

    expect(index.get('/p/components/app-badge.fud')).toBeUndefined();
  });

  it('renames as a removal plus a read: the role travels with the content', () => {
    const files: Record<string, string> = { ...FILES, '/p/components/app-pill.fud': component('app-badge') };
    const index = indexOver(files);
    delete files['/p/components/app-badge.fud'];

    index.rename('/p/components/app-badge.fud', '/p/components/app-pill.fud');

    expect(index.get('/p/components/app-badge.fud')).toBeUndefined();
    expect(index.get('/p/components/app-pill.fud')?.tag).toBe('app-badge');
  });
});

describe('what a file declares', () => {
  const doc = (source: string) => parseFud(source).document;

  it('only a component owns a tag', () => {
    expect(tagOf(doc(component('app-x')))).toBe('app-x');
    expect(tagOf(doc(PAGE))).toBe('');
  });

  it('only a route names a layout', () => {
    expect(layoutHrefOf(doc(route('../layouts/_layout.fud')))).toBe('../layouts/_layout.fud');
    expect(layoutHrefOf(doc(LAYOUT))).toBe('');
  });

  it('only a layout has holes, and a layout without @RenderBody has no body hole', () => {
    expect(holesOf(doc(component('app-x')))).toEqual({ renderSections: [] });
    expect(holesOf(doc(LAYOUT)).renderBody).toBeDefined();

    const sectionsOnly = LAYOUT.replace('@RenderBody()', '@RenderSection(nav)');
    const holes = holesOf(doc(sectionsOnly));
    expect(holes).not.toHaveProperty('renderBody');
    expect(holes.renderSections.map((section) => section.name)).toEqual(['nav']);
  });
});
