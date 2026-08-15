/**
 * SDD-27 §5.1: from the `page` pass the CHUNKS are dead weight; the ASSETS never are.
 */

import { describe, it, expect } from 'vitest';
import { keepSet, reachableChunks, type PruneItem } from '../src/prune.js';

const chunk = (fileName: string, imports: readonly string[] = []): PruneItem => ({
  type: 'chunk',
  fileName,
  imports,
});
const asset = (fileName: string): PruneItem => ({ type: 'asset', fileName });

/** The shape of a real `examples/basic` bundle, trimmed to what the decision reads. */
const BUNDLE: readonly PruneItem[] = [
  chunk('fudic-main.js'),
  chunk('assets/h/app-badge-BW.js', ['assets/element-Cz.js']),
  chunk('assets/h/app-card-ZM.js', ['assets/element-Cz.js']),
  chunk('assets/element-Cz.js'),
  chunk('assets/c/index-Ch.js', ['assets/stream-a6.js', 'assets/app-card-D3.js']),
  chunk('assets/c/about-Dc.js', ['assets/stream-a6.js']),
  chunk('assets/stream-a6.js'),
  chunk('assets/app-card-D3.js'),
  asset('assets/h/app-badge-BW.js.map'),
  asset('assets/c/index-Ch.js.map'),
  asset('assets/stream-a6.js.map'),
  asset('logo-DEADBEEF.png'),
  asset('index.html'),
  asset('fudic-routes.json'),
];

const ROOTS = new Set(['fudic-main.js', 'assets/h/app-badge-BW.js', 'assets/h/app-card-ZM.js']);
const keep = (): ReadonlySet<string> => keepSet(BUNDLE, (item) => ROOTS.has(item.fileName));

describe('keepSet', () => {
  it('keeps the roots and drops the page chunks', () => {
    const kept = keep();
    for (const root of ROOTS) {
      expect(kept.has(root)).toBe(true);
    }
    expect(kept.has('assets/c/index-Ch.js')).toBe(false);
    expect(kept.has('assets/c/about-Dc.js')).toBe(false);
  });

  it('keeps a shared chunk two roots import, without naming it', () => {
    // `element-*` is not a root and nobody lists it: it survives because it is reachable.
    expect(keep().has('assets/element-Cz.js')).toBe(true);
  });

  it('drops a shared chunk only the page pass reaches', () => {
    expect(keep().has('assets/stream-a6.js')).toBe(false);
    expect(keep().has('assets/app-card-D3.js')).toBe(false);
  });

  it('keeps every asset that is not the map of a dropped chunk', () => {
    const kept = keep();
    expect(kept.has('logo-DEADBEEF.png')).toBe(true); // THE reason the pass survives
    expect(kept.has('index.html')).toBe(true);
    expect(kept.has('fudic-routes.json')).toBe(true);
    expect(kept.has('assets/h/app-badge-BW.js.map')).toBe(true);
  });

  it('a map goes with its chunk', () => {
    const kept = keep();
    expect(kept.has('assets/c/index-Ch.js.map')).toBe(false);
    expect(kept.has('assets/stream-a6.js.map')).toBe(false);
  });

  it('keeps a chunk that is reachable AND was visited before its root', () => {
    // Order matters to the algorithm, not to the answer: a chunk listed before the root
    // that reaches it is still kept.
    const items = [chunk('shared.js'), chunk('root.js', ['shared.js'])];
    const kept = keepSet(items, (i) => i.fileName === 'root.js');
    expect([...kept].sort()).toEqual(['root.js', 'shared.js']);
  });

  it('tolerates an import that names nothing in this bundle', () => {
    // `@fudic/ssr` in the link pass, or anything the host externalized.
    const items = [chunk('root.js', ['@fudic/ssr'])];
    expect([...keepSet(items, () => true)]).toEqual(['root.js', '@fudic/ssr']);
  });

  it('tolerates a chunk with no imports field at all', () => {
    const items: PruneItem[] = [{ type: 'chunk', fileName: 'lonely.js' }];
    expect([...keepSet(items, () => true)]).toEqual(['lonely.js']);
  });

  it('keeps nothing but assets when no chunk is a root', () => {
    expect([...keepSet(BUNDLE, () => false)].sort()).toEqual([
      'fudic-routes.json',
      'index.html',
      'logo-DEADBEEF.png',
    ]);
  });
});

describe('reachableChunks — the shell of SDD-17 §4.7.1', () => {
  it('takes the root and everything it statically imports, hashed names included', () => {
    // The bootstrap sharing a chunk with the hydration chunks is what makes this necessary:
    // `assets/element-Cz.js` is a name no `sw.json` could have been written with.
    const items = [
      chunk('fudic-main.js', ['assets/element-Cz.js']),
      chunk('assets/element-Cz.js', ['assets/signal-Q1.js']),
      chunk('assets/signal-Q1.js'),
      chunk('assets/h/app-card-ZM.js', ['assets/element-Cz.js']),
      asset('index.html'),
    ];
    expect(reachableChunks(items, (i) => i.fileName === 'fudic-main.js')).toEqual([
      'fudic-main.js',
      'assets/element-Cz.js',
      'assets/signal-Q1.js',
    ]);
  });

  it('a self-contained bootstrap contributes exactly itself', () => {
    const items = [chunk('fudic-main.js'), chunk('assets/h/app-card-ZM.js')];
    expect(reachableChunks(items, (i) => i.fileName === 'fudic-main.js')).toEqual(['fudic-main.js']);
  });

  it('never lists an asset, nor an import that names nothing in this bundle', () => {
    const items = [chunk('root.js', ['@fudic/ssr', 'root.js.map']), asset('root.js.map')];
    expect(reachableChunks(items, () => true)).toEqual(['root.js']);
  });

  it('with no root there is nothing to precache', () => {
    expect(reachableChunks(BUNDLE, () => false)).toEqual([]);
  });
});
