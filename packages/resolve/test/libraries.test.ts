/**
 * `findLibraries` — the OTHER source of the index (SDD-43 §4.4, criterion 9) — and
 * `dependencyChain`, the same walk in the order §4.6 needs.
 *
 * The index's sweep prunes `node_modules` and keeps pruning it. What is added is a walk of the
 * DECLARED dependency graph, whose cost is the number of dependencies and not the size of
 * the store — which is the whole reason it is allowed to exist beside a prune that refuses
 * to look there.
 */

import { describe, it, expect } from 'vitest';
import { findLibraries, dependencyChain, owningPackage } from '../src/libraries.js';
import type { LibraryFs } from '../src/libraries.js';

/** A `LibraryFs` over a flat map: no disk, no symlinks — a path is its own real name. */
function memoryFs(files: Readonly<Record<string, string>>): LibraryFs {
  return {
    fudFiles: (root) =>
      Object.keys(files).filter((path) => path.startsWith(root) && path.endsWith('.fud')),
    readFile: (path) => files[path],
    realPath: (path) => path,
  };
}

/** A minimal component `.fud` defining `tag`. */
const component = (tag: string): string =>
  `<${tag}>\n  <template shadowrootmode="open"><slot></slot></template>\n</${tag}>\n`;

const APP = '/ws/apps/tienda';

const manifest = (name: string, deps: Readonly<Record<string, string>> = {}): string =>
  JSON.stringify({ name, version: '1.0.0', dependencies: deps });

const LIB = JSON.stringify({ kind: 'lib', prefix: 'ui' });

describe('findLibraries', () => {
  it('finds a package that declares itself a library', () => {
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*' }),
        [`${APP}/node_modules/@acme/ui/package.json`]: manifest('@acme/ui'),
        [`${APP}/node_modules/@acme/ui/fudic.json`]: LIB,
        [`${APP}/node_modules/@acme/ui/src/ui-card.fud`]: component('ui-card'),
      }),
    );

    expect(libraries).toHaveLength(1);
    expect(libraries[0]?.name).toBe('@acme/ui');
    expect(libraries[0]?.config.kind).toBe('lib');
    expect(libraries[0]?.files).toEqual([`${APP}/node_modules/@acme/ui/src/ui-card.fud`]);
  });

  it('finds one installed higher up, as a workspace hoists them', () => {
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*' }),
        '/ws/node_modules/@acme/ui/package.json': manifest('@acme/ui'),
        '/ws/node_modules/@acme/ui/fudic.json': LIB,
        '/ws/node_modules/@acme/ui/ui-card.fud': component('ui-card'),
      }),
    );
    expect(libraries.map((l) => l.root)).toEqual(['/ws/node_modules/@acme/ui']);
  });

  it('follows a library that consumes another one', () => {
    // The case that motivated the whole thing: a guide, under a component set, under apps.
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*' }),
        '/ws/node_modules/@acme/ui/package.json': manifest('@acme/ui', { '@acme/guia': '*' }),
        '/ws/node_modules/@acme/ui/fudic.json': LIB,
        '/ws/node_modules/@acme/ui/ui-card.fud': component('ui-card'),
        '/ws/node_modules/@acme/guia/package.json': manifest('@acme/guia'),
        '/ws/node_modules/@acme/guia/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'g' }),
        '/ws/node_modules/@acme/guia/g-box.fud': component('g-box'),
      }),
    );
    expect(libraries.map((l) => l.name).sort()).toEqual(['@acme/guia', '@acme/ui']);
  });

  it('walks devDependencies and peerDependencies too', () => {
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: JSON.stringify({
          name: '@acme/tienda',
          devDependencies: { '@acme/ui': '*' },
          peerDependencies: { '@acme/guia': '*' },
        }),
        '/ws/node_modules/@acme/ui/package.json': manifest('@acme/ui'),
        '/ws/node_modules/@acme/ui/fudic.json': LIB,
        '/ws/node_modules/@acme/guia/package.json': manifest('@acme/guia'),
        '/ws/node_modules/@acme/guia/fudic.json': JSON.stringify({ kind: 'lib' }),
      }),
    );
    expect(libraries.map((l) => l.name).sort()).toEqual(['@acme/guia', '@acme/ui']);
  });

  it('ignores a dependency that is not a fudic project at all', () => {
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { lodash: '*' }),
        '/ws/node_modules/lodash/package.json': manifest('lodash'),
      }),
    );
    expect(libraries).toEqual([]);
  });

  it('ignores a fudic project that is an APP', () => {
    // Reaching into one is the coupling FUD0763 refuses in the build; indexing it here
    // would be the same mistake made quietly.
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/otra': '*' }),
        '/ws/node_modules/@acme/otra/package.json': manifest('@acme/otra'),
        '/ws/node_modules/@acme/otra/fudic.json': JSON.stringify({ kind: 'app', id: 'otra' }),
        '/ws/node_modules/@acme/otra/x.fud': component('otra-x'),
      }),
    );
    expect(libraries).toEqual([]);
  });

  it('ignores a dependency that is not installed', () => {
    const libraries = findLibraries(
      APP,
      memoryFs({ [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*' }) }),
    );
    expect(libraries).toEqual([]);
  });

  it('says nothing when there is no package.json, and never throws', () => {
    expect(findLibraries(APP, memoryFs({}))).toEqual([]);
  });

  it('survives a manifest that does not parse', () => {
    // A `package.json` being edited declares nothing, and is not a failure either.
    expect(findLibraries(APP, memoryFs({ [`${APP}/package.json`]: '{ "name": ' }))).toEqual([]);
  });

  it('survives a manifest that is not an object, and fields that are not', () => {
    expect(findLibraries(APP, memoryFs({ [`${APP}/package.json`]: '[]' }))).toEqual([]);
    expect(findLibraries(APP, memoryFs({ [`${APP}/package.json`]: 'null' }))).toEqual([]);
    expect(
      findLibraries(
        APP,
        memoryFs({ [`${APP}/package.json`]: JSON.stringify({ dependencies: 'no' }) }),
      ),
    ).toEqual([]);
  });

  it('counts a library once, however many packages depend on it', () => {
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*', '@acme/otra': '*' }),
        '/ws/node_modules/@acme/ui/package.json': manifest('@acme/ui', { '@acme/guia': '*' }),
        '/ws/node_modules/@acme/ui/fudic.json': LIB,
        '/ws/node_modules/@acme/otra/package.json': manifest('@acme/otra', { '@acme/guia': '*' }),
        '/ws/node_modules/@acme/otra/fudic.json': LIB,
        '/ws/node_modules/@acme/guia/package.json': manifest('@acme/guia'),
        '/ws/node_modules/@acme/guia/fudic.json': LIB,
      }),
    );
    expect(libraries.filter((l) => l.name === '@acme/guia')).toHaveLength(1);
  });

  it('does not loop on a dependency cycle', () => {
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*' }),
        '/ws/node_modules/@acme/ui/package.json': manifest('@acme/ui', { '@acme/guia': '*' }),
        '/ws/node_modules/@acme/ui/fudic.json': LIB,
        '/ws/node_modules/@acme/guia/package.json': manifest('@acme/guia', { '@acme/ui': '*' }),
        '/ws/node_modules/@acme/guia/fudic.json': LIB,
      }),
    );
    expect(libraries).toHaveLength(2);
  });

  it('stops at the filesystem root rather than walking for ever', () => {
    expect(
      findLibraries('/', memoryFs({ '/package.json': manifest('root', { '@acme/ui': '*' }) })),
    ).toEqual([]);
  });

  it('reads the name from the package it found, not from the specifier that asked', () => {
    // `Library.name` says «as its `package.json` spells it», and a dependency can be
    // installed under an alias. The manifest is the one that knows.
    const libraries = findLibraries(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { ui: '*' }),
        [`${APP}/node_modules/ui/package.json`]: manifest('@acme/ui'),
        [`${APP}/node_modules/ui/fudic.json`]: LIB,
      }),
    );
    expect(libraries.map((l) => l.name)).toEqual(['@acme/ui']);
  });

  it('takes a Windows-shaped root: every path in the walk is POSIX', () => {
    const libraries = findLibraries(
      'C:\\ws\\apps\\tienda',
      memoryFs({
        'C:/ws/apps/tienda/package.json': manifest('@acme/tienda', { '@acme/ui': '*' }),
        'C:/ws/apps/tienda/node_modules/@acme/ui/package.json': manifest('@acme/ui'),
        'C:/ws/apps/tienda/node_modules/@acme/ui/fudic.json': LIB,
      }),
    );
    expect(libraries.map((l) => l.name)).toEqual(['@acme/ui']);
  });
});

describe('dependencyChain — the same walk, in the order the style guides compose (§4.6)', () => {
  /** guia ← ui ← tienda: the shape that motivated the whole thing. */
  const CHAIN: Readonly<Record<string, string>> = {
    [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*' }),
    [`${APP}/fudic.json`]: JSON.stringify({ kind: 'app', id: 'tienda', styles: ['tienda.css'] }),
    '/ws/node_modules/@acme/ui/package.json': manifest('@acme/ui', { '@acme/guia': '*' }),
    '/ws/node_modules/@acme/ui/fudic.json': JSON.stringify({ kind: 'lib', styles: ['ui.css'] }),
    '/ws/node_modules/@acme/guia/package.json': manifest('@acme/guia'),
    '/ws/node_modules/@acme/guia/fudic.json': JSON.stringify({ kind: 'lib', styles: ['tokens.css'] }),
  };

  it('answers dependencies first and the package itself last', () => {
    expect(dependencyChain(APP, memoryFs(CHAIN)).map((p) => p.name)).toEqual([
      '@acme/guia',
      '@acme/ui',
      '@acme/tienda',
    ]);
  });

  it('starts in the middle of the chain when asked about a library', () => {
    // A component of `ui` adopts the guide's sheet and its own, and NOT the consumer's: the
    // app does not define it. That is the whole of §4.6, read off this order.
    expect(dependencyChain('/ws/node_modules/@acme/ui', memoryFs(CHAIN)).map((p) => p.name)).toEqual([
      '@acme/guia',
      '@acme/ui',
    ]);
  });

  it('includes the starting package whatever its kind, and only libraries after it', () => {
    // An app is the common starting point and is never a `lib`; a dependency that is an app
    // is not a link in a fudic chain, and is not walked through either.
    const chain = dependencyChain(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/otra': '*' }),
        [`${APP}/fudic.json`]: JSON.stringify({ kind: 'app', id: 'tienda' }),
        '/ws/node_modules/@acme/otra/package.json': manifest('@acme/otra', { '@acme/guia': '*' }),
        '/ws/node_modules/@acme/otra/fudic.json': JSON.stringify({ kind: 'app', id: 'otra' }),
        '/ws/node_modules/@acme/guia/package.json': manifest('@acme/guia'),
        '/ws/node_modules/@acme/guia/fudic.json': JSON.stringify({ kind: 'lib' }),
      }),
    );
    expect(chain.map((p) => p.name)).toEqual(['@acme/tienda']);
  });

  it('leaves out a package with no fudic.json, the starting one included', () => {
    expect(
      dependencyChain(
        APP,
        memoryFs({
          [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*' }),
          '/ws/node_modules/@acme/ui/package.json': manifest('@acme/ui'),
          '/ws/node_modules/@acme/ui/fudic.json': LIB,
        }),
      ).map((p) => p.name),
    ).toEqual(['@acme/ui']);
  });

  it('does not loop on a cycle, and keeps every package once', () => {
    const chain = dependencyChain(
      APP,
      memoryFs({
        [`${APP}/package.json`]: manifest('@acme/tienda', { '@acme/ui': '*' }),
        [`${APP}/fudic.json`]: JSON.stringify({ kind: 'app', id: 'tienda' }),
        '/ws/node_modules/@acme/ui/package.json': manifest('@acme/ui', { '@acme/guia': '*' }),
        '/ws/node_modules/@acme/ui/fudic.json': LIB,
        '/ws/node_modules/@acme/guia/package.json': manifest('@acme/guia', { '@acme/ui': '*' }),
        '/ws/node_modules/@acme/guia/fudic.json': LIB,
      }),
    );
    expect(chain.map((p) => p.name)).toEqual(['@acme/guia', '@acme/ui', '@acme/tienda']);
  });

  it('carries the config, which is what the styles are read from', () => {
    const chain = dependencyChain(APP, memoryFs(CHAIN));
    expect(chain.map((p) => p.config.styles)).toEqual([['tokens.css'], ['ui.css'], ['tienda.css']]);
    expect(chain.map((p) => p.root)).toEqual([
      '/ws/node_modules/@acme/guia',
      '/ws/node_modules/@acme/ui',
      APP,
    ]);
  });

  it('is empty for a directory that holds nothing at all', () => {
    expect(dependencyChain('/nowhere', memoryFs({}))).toEqual([]);
  });

  it('answers which package a FILE belongs to, which is what §4.6 turns on', () => {
    // «Whose component is this» — a path is all the emit ever knows about where a component
    // came from, and the chain that decides its style guides is that package's.
    const files = memoryFs({
      [`${APP}/package.json`]: manifest('@acme/tienda'),
      [`${APP}/src/components/app-panel.fud`]: component('app-panel'),
      '/ws/libs/ui/package.json': manifest('@acme/ui'),
      '/ws/libs/ui/src/ui-card.fud': component('ui-card'),
      '/loose/x.fud': component('x-y'),
    });
    expect(owningPackage(`${APP}/src/components/app-panel.fud`, files)).toBe(APP);
    expect(owningPackage('/ws/libs/ui/src/ui-card.fud', files)).toBe('/ws/libs/ui');
    // A file no package claims, and a path with nowhere left to climb.
    expect(owningPackage('/loose/x.fud', files)).toBeUndefined();
    expect(owningPackage('/x.fud', files)).toBeUndefined();
  });

  it('takes a Windows-shaped file path too', () => {
    const files = memoryFs({ 'C:/ws/apps/tienda/package.json': manifest('@acme/tienda') });
    expect(owningPackage('C:\\ws\\apps\\tienda\\src\\a.fud', files)).toBe('C:/ws/apps/tienda');
  });

  it('names nothing when the manifest does not, and when there is no manifest at all', () => {
    // A fudic project need not be a published package: a private app is often nameless, and
    // a project root that nobody installs need not have a `package.json` in the first place.
    const app = JSON.stringify({ kind: 'app', id: 'tienda' });
    expect(
      dependencyChain(
        APP,
        memoryFs({ [`${APP}/package.json`]: JSON.stringify({ private: true }), [`${APP}/fudic.json`]: app }),
      ).map((p) => p.name),
    ).toEqual(['']);
    expect(dependencyChain(APP, memoryFs({ [`${APP}/fudic.json`]: app })).map((p) => p.name)).toEqual(['']);
  });
});
