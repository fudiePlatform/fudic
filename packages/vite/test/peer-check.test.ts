/**
 * SDD-43 §4.7 — `FUD0762`: the library and its consumer have to share a grammar.
 *
 * A library publishes `.fud` SOURCE, so the compiler that parses it is the consumer's. The
 * library says which compiler it was written for and this compares that range with the one the
 * build resolved — a warning, once per library, because the range is the author's judgement
 * from the day they published and a range one minor too narrow must not stop a build that
 * works. What it must not do is fail in silence.
 *
 * The range reader is deliberately narrow: what it cannot read produces NO diagnostic. A false
 * warning on every build teaches an author to stop reading warnings, which costs more than the
 * one it would have caught.
 */

import { describe, expect, it } from 'vitest';
import type { PackageFs } from '@fudic/resolve';
import { checkPeers, satisfies, COMPILER_PACKAGE } from '../src/peer-check.js';
import { FUD_LIB_PEER_MISMATCH } from '../src/diagnostics.js';

const APP = '/ws/apps/tienda';

const fs = (files: Readonly<Record<string, string>>): PackageFs => ({
  readFile: (path) => files[path],
  realPath: (path) => path,
});

/** An app with one library, both declaring what they need. */
function workspace(options: {
  readonly compiler?: string;
  readonly peer?: string;
}): Readonly<Record<string, string>> {
  const files: Record<string, string> = {
    [`${APP}/package.json`]: JSON.stringify({
      name: '@acme/tienda',
      dependencies: { '@acme/ui': 'workspace:*' },
    }),
    [`${APP}/fudic.json`]: JSON.stringify({ kind: 'app', id: 'tienda' }),
    [`${APP}/node_modules/@acme/ui/package.json`]: JSON.stringify({
      name: '@acme/ui',
      ...(options.peer === undefined ? {} : { peerDependencies: { [COMPILER_PACKAGE]: options.peer } }),
    }),
    [`${APP}/node_modules/@acme/ui/fudic.json`]: JSON.stringify({ kind: 'lib', prefix: 'ui' }),
  };
  if (options.compiler !== undefined) {
    files[`${APP}/node_modules/${COMPILER_PACKAGE}/package.json`] = JSON.stringify({
      name: COMPILER_PACKAGE,
      version: options.compiler,
    });
  }
  return files;
}

describe('checkPeers', () => {
  it('warns once, naming both versions, when the resolved compiler is out of range', () => {
    const found = checkPeers(APP, fs(workspace({ compiler: '2.0.0', peer: '^1.0.0' })));
    expect(found).toHaveLength(1);
    expect(found[0]?.code).toBe(FUD_LIB_PEER_MISMATCH);
    expect(found[0]?.file).toBe('@acme/ui');
    expect(found[0]?.message).toContain('^1.0.0');
    expect(found[0]?.message).toContain('2.0.0');
  });

  it('says nothing when the compiler is in range', () => {
    expect(checkPeers(APP, fs(workspace({ compiler: '1.4.2', peer: '^1.0.0' })))).toEqual([]);
  });

  it('says nothing about a library that declares no compiler peer', () => {
    // §4.7 is advice a library can decline. What it cannot do is declare a wrong range.
    expect(checkPeers(APP, fs(workspace({ compiler: '2.0.0' })))).toEqual([]);
  });

  it('says nothing about a range it cannot read', () => {
    expect(checkPeers(APP, fs(workspace({ compiler: '2.0.0', peer: 'next' })))).toEqual([]);
    expect(checkPeers(APP, fs(workspace({ compiler: '2.0.0', peer: '   ' })))).toEqual([]);
  });

  it('says nothing when no compiler can be found to compare against', () => {
    // Which is every build of a temp directory: there is nothing installed to read.
    expect(checkPeers(APP, fs(workspace({ peer: '^1.0.0' })))).toEqual([]);
  });

  it('finds a compiler hoisted above the project, as a workspace installs it', () => {
    const found = checkPeers(
      APP,
      fs({
        ...workspace({ peer: '^1.0.0' }),
        [`/ws/node_modules/${COMPILER_PACKAGE}/package.json`]: JSON.stringify({ version: '3.1.0' }),
      }),
    );
    expect(found).toHaveLength(1);
  });

  it('ignores a manifest that does not parse, is not an object, or has no peer object', () => {
    const base = workspace({ compiler: '2.0.0', peer: '^1.0.0' });
    expect(
      checkPeers(APP, fs({ ...base, [`${APP}/node_modules/@acme/ui/package.json`]: '{ "name": ' })),
    ).toEqual([]);
    expect(
      checkPeers(APP, fs({ ...base, [`${APP}/node_modules/@acme/ui/package.json`]: '"a string"' })),
    ).toEqual([]);
    expect(
      checkPeers(
        APP,
        fs({
          ...base,
          [`${APP}/node_modules/@acme/ui/package.json`]: JSON.stringify({
            name: '@acme/ui',
            peerDependencies: 'no',
          }),
        }),
      ),
    ).toEqual([]);
    expect(
      checkPeers(
        APP,
        fs({
          ...base,
          [`${APP}/node_modules/${COMPILER_PACKAGE}/package.json`]: JSON.stringify({ version: 2 }),
        }),
      ),
    ).toEqual([]);
  });

  it('names a nameless library by its directory: something has to be nameable', () => {
    const found = checkPeers(
      APP,
      fs({
        ...workspace({ compiler: '2.0.0' }),
        [`${APP}/node_modules/@acme/ui/package.json`]: JSON.stringify({
          peerDependencies: { [COMPILER_PACKAGE]: '^1.0.0' },
        }),
      }),
    );
    expect(found[0]?.file).toBe(`${APP}/node_modules/@acme/ui`);
  });

  it('says nothing about the consumer itself, whatever it declares', () => {
    const found = checkPeers(
      APP,
      fs({
        ...workspace({ compiler: '2.0.0' }),
        [`${APP}/package.json`]: JSON.stringify({
          name: '@acme/tienda',
          peerDependencies: { [COMPILER_PACKAGE]: '^1.0.0' },
        }),
      }),
    );
    expect(found).toEqual([]);
  });
});

describe('satisfies — the subset of ranges a peerDependencies carries', () => {
  const cases: readonly (readonly [string, string, boolean | undefined])[] = [
    // caret, and its two rules below 1.0.0 — which is every fudic package today
    ['1.4.2', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['0.3.9', '^0.3.1', true],
    ['0.4.0', '^0.3.1', false],
    ['0.0.1', '^0.0.1', true],
    ['0.0.2', '^0.0.1', false],
    // tilde: the next minor, whatever the major
    ['1.2.9', '~1.2.0', true],
    ['1.3.0', '~1.2.0', false],
    // comparators
    ['1.2.3', '>=1.2.3', true],
    ['1.2.2', '>=1.2.3', false],
    ['1.2.4', '>1.2.3', true],
    ['1.2.3', '>1.2.3', false],
    ['1.2.2', '<1.2.3', true],
    ['1.2.3', '<1.2.3', false],
    ['1.2.3', '<=1.2.3', true],
    ['1.2.4', '<=1.2.3', false],
    ['1.2.9', '<=1.2', true],
    ['1.3.0', '<=1.2', false],
    // exact, partial and wildcard
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
    ['1.2.9', '1.2', true],
    ['1.3.0', '1.2', false],
    ['1.9.9', '1', true],
    ['2.0.0', '1', false],
    ['1.2.3', '1.x', true],
    ['2.0.0', '1.x', false],
    ['9.9.9', '*', true],
    ['9.9.9', 'x', true],
    ['9.9.9', 'X', true],
    ['1.2.3', 'v1.2.3', true],
    ['1.2.3', '=1.2.3', true],
    // a comparator over nothing but wildcards constrains nothing
    ['1.2.3', '^x', true],
    ['1.2.3', '>=x', true],
    // several comparators, ANDed by a space — with the operator written apart from its
    // version too, which is how npm prints them
    ['1.5.0', '>=1.2.0 <2.0.0', true],
    ['2.1.0', '>=1.2.0 <2.0.0', false],
    ['1.5.0', '>= 1.2.0 < 2.0.0', true],
    ['2.1.0', '>= 1.2.0 < 2.0.0', false],
    // alternatives
    ['2.1.0', '^1.0.0 || ^2.0.0', true],
    ['3.0.0', '^1.0.0 || ^2.0.0', false],
    // prerelease and build metadata: the 1.2.3 grammar is the 1.2.3 grammar
    ['1.2.3-rc.1', '^1.2.0', true],
    ['1.2.3+build.5', '1.2.3', true],
    // what it will not read, and then says so rather than guessing
    ['1.2.3', '1.2.3 - 2.0.0', undefined],
    ['1.2.3', 'latest', undefined],
    ['1.2.3', '1.2.3.4', undefined],
    ['1.2.3', '1.x.3', undefined],
    ['1.2.3', '>=1.0.0 || broken', true],
    ['3.0.0', '^1.0.0 || broken', undefined],
    ['not-a-version', '*', undefined],
    ['1.2.3', '', undefined],
  ];

  for (const [version, range, expected] of cases) {
    it(`${version} against "${range}" is ${String(expected)}`, () => {
      expect(satisfies(version, range)).toBe(expected);
    });
  }
});
