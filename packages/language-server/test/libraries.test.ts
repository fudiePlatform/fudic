/**
 * `findLibraries` — the OTHER source of the index (SDD-43 §4.4, criterion 9).
 *
 * The sweep prunes `node_modules` and keeps pruning it. What is added is a walk of the
 * DECLARED dependency graph, whose cost is the number of dependencies and not the size of
 * the store — which is the whole reason it is allowed to exist beside a prune that refuses
 * to look there.
 */

import { describe, it, expect } from 'vitest';
import { findLibraries } from '../src/libraries.js';
import { memoryFs, component } from './_support.js';

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
});
