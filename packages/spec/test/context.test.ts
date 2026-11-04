/**
 * SDD-77 §3.6 and §8.2.8 — `specContextOf`: what a `.fudspec` is validated against, built once
 * for the editor, the workbench and the project check.
 */

import { describe, expect, it } from 'vitest';
import {
  FIXTURE_EXTENSION,
  SPEC_EXTENSION,
  TERMS_DIR,
  TERMS_PACKAGE,
  fixturePathOf,
  installedTerms,
  specContextOf,
  termRootsOf,
  type ComponentInfo,
  type SpecFs,
  type SpecIo,
} from '../src/index.js';
import { memoryFs, termSource } from './terms.js';

const CARD: ComponentInfo = { tag: 'app-card', path: '/ws/app/src/components/app-card/app-card.fud', requiredProps: ['title'] };
const FIXTURE = '/ws/app/src/components/app-card/app-card.fixture.ts';
const INSTALLED = `/ws/app/node_modules/${TERMS_PACKAGE}/terms`;

/** A disk over a map: a directory lists its files and its folders, as the real one does. */
function disk(files: Readonly<Record<string, string | undefined>>): SpecFs {
  const files_ = memoryFs(files);
  return {
    readFile: (path) => files_.readFile(path),
    readDirectory: (path) => {
      const prefix = `${path}/`;
      const names = Object.keys(files)
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length).split('/')[0]!);
      return [...new Set(names)];
    },
  };
}

function io(files: Readonly<Record<string, string | undefined>>, extra: Partial<SpecIo> = {}): SpecIo {
  return { fs: disk(files), component: (tag) => (tag === CARD.tag ? CARD : undefined), ...extra };
}

describe('the names', () => {
  it('are the conventions of a project', () => {
    expect([SPEC_EXTENSION, TERMS_DIR, FIXTURE_EXTENSION, TERMS_PACKAGE]).toEqual(['.fudspec', 'fudic/terms', '.fixture.ts', '@fudic/terms']);
  });
});

describe('installedTerms', () => {
  it('the @fudic/terms of the folder itself', () => {
    expect(installedTerms(disk({ [`${INSTALLED}/then/visible.js`]: '' }), '/ws/app')).toBe(INSTALLED);
  });

  it('or of a folder above it, the nearest first', () => {
    const fs = disk({
      [`/ws/node_modules/${TERMS_PACKAGE}/terms/then/visible.js`]: '',
      [`/node_modules/${TERMS_PACKAGE}/terms/then/visible.js`]: '',
    });
    expect(installedTerms(fs, '/ws/app/libs/ui')).toBe(`/ws/node_modules/${TERMS_PACKAGE}/terms`);
  });

  it('up to the root of the disk, included', () => {
    expect(installedTerms(disk({ [`/node_modules/${TERMS_PACKAGE}/terms/x.js`]: '' }), '/ws/app')).toBe(`/node_modules/${TERMS_PACKAGE}/terms`);
    expect(installedTerms(disk({ [`C:/node_modules/${TERMS_PACKAGE}/terms/x.js`]: '' }), 'C:/ws')).toBe(`C:/node_modules/${TERMS_PACKAGE}/terms`);
  });

  it('a package without terms/ is not it; none installed is undefined', () => {
    expect(installedTerms(disk({ [`/ws/app/node_modules/${TERMS_PACKAGE}/package.json`]: '{}' }), '/ws/app')).toBeUndefined();
    expect(installedTerms(disk({}), 'C:/ws/app')).toBeUndefined();
  });
});

describe('fixturePathOf', () => {
  it('is <tag>.fixture.ts next to the .fud', () => {
    expect(fixturePathOf(CARD)).toBe(FIXTURE);
  });
});

describe('termRootsOf', () => {
  it('the project first, then the framework installed', () => {
    expect(termRootsOf('/ws/app', io({ [`${INSTALLED}/then/visible.js`]: '' }))).toEqual([
      { layer: 'workspace', path: '/ws/app/fudic/terms' },
      { layer: 'framework', path: INSTALLED },
    ]);
  });

  it('the framework the caller names, instead of the installed one', () => {
    expect(termRootsOf('/ws/app', io({ [`${INSTALLED}/then/visible.js`]: '' }, { frameworkTerms: '/fw/terms' }))[1]).toEqual({
      layer: 'framework',
      path: '/fw/terms',
    });
  });

  it('only the project when none is installed, or the caller says none', () => {
    expect(termRootsOf('/ws/app', io({}))).toEqual([{ layer: 'workspace', path: '/ws/app/fudic/terms' }]);
    expect(termRootsOf('/ws/app', io({ [`${INSTALLED}/then/visible.js`]: '' }, { frameworkTerms: null }))).toHaveLength(1);
  });

  it('an empty root is a file of no project: no terms at all', () => {
    expect(termRootsOf('', io({ [`/node_modules/${TERMS_PACKAGE}/terms/then/visible.js`]: '' }))).toEqual([]);
  });
});

describe('specContextOf', () => {
  const files = {
    '/ws/app/fudic/terms/then/visible.js': termSource('visible', 'then'),
    [`${INSTALLED}/then/visible.js`]: termSource('visible', 'then'),
    [`${INSTALLED}/then/min-height.js`]: termSource('min-height', 'then'),
    [FIXTURE]: 'export default {\n  empty: {},\n  "long-title": { title: "x" },\n};\n',
  };

  it('terms in layer order: the project wins', () => {
    const context = specContextOf('/ws/app', io(files));
    expect(context.terms.resolve('then', 'visible')?.layer).toBe('workspace');
    expect(context.terms.resolve('then', 'min-height')?.layer).toBe('framework');
  });

  it('a component is what the caller says, and its fixtures are read from beside it', () => {
    const context = specContextOf('/ws/app', io(files));
    expect(context.component('app-card')).toBe(CARD);
    expect(context.component('app-none')).toBeUndefined();
    const fixtures = context.fixtures('app-card');
    expect(fixtures?.path).toBe(FIXTURE);
    expect(fixtures?.names.map((n) => n.text)).toEqual(['empty', 'long-title']);
  });

  it('no fixtures for an unknown component, or one without its file', () => {
    const context = specContextOf('/ws/app', io({}));
    expect(context.fixtures('app-none')).toBeUndefined();
    expect(context.fixtures('app-card')).toBeUndefined();
  });

  it('a file of no project validates against no terms', () => {
    expect(specContextOf('', io(files)).terms.list('then')).toEqual([]);
  });
});
