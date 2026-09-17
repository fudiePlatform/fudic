/**
 * `resolveHref` over an injected filesystem (SDD-43 §3.1).
 *
 * A map instead of a disk, so what is measured here is the logic and not Node's resolver —
 * that one is exercised against real files in `node.test.ts`, which is where it belongs.
 */

import { describe, it, expect } from 'vitest';
import { resolveHref, resolveHrefPath, type PackageLookup, type ResolveFs } from '../src/resolve.js';

/** POSIX path arithmetic, enough for a test: no drive letters, no symlinks. */
function join(fromPath: string, href: string): string {
  const out: string[] = [];
  const base = href.startsWith('/') ? [] : dirname(fromPath).split('/');
  for (const segment of [...base, ...href.split('/')]) {
    if (segment === '.' || (segment === '' && out.length > 0)) continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

function dirname(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut <= 0 ? '/' : path.slice(0, cut);
}

/** A filesystem in a `Record`, plus whatever the host's module resolver is told to answer. */
function fs(
  files: Readonly<Record<string, string>>,
  packages: Readonly<Record<string, PackageLookup>> = {},
): ResolveFs {
  return {
    exists: (path) => files[path] !== undefined,
    read: (path) => {
      const text = files[path];
      if (text === undefined) throw new Error(`ENOENT: ${path}`);
      return text;
    },
    join,
    dirname,
    resolvePackage: (specifier) =>
      packages[specifier] ?? { ok: false, reason: 'not-installed' as const },
  };
}

const FROM = '/ws/apps/tienda/src/routes/index.fud';

describe('a path href', () => {
  it('resolves against the file, as it always did', () => {
    const io = fs({});
    expect(resolveHref(FROM, './card.fud', io)).toEqual({
      outcome: 'path',
      path: '/ws/apps/tienda/src/routes/card.fud',
    });
  });

  it('crosses into another package when the path says so', () => {
    // SDD-43 adds a form; it does not replace the one that is there (criterion 3).
    const io = fs({});
    expect(resolveHref(FROM, '../../../../libs/ui/src/card.fud', io)).toEqual({
      outcome: 'path',
      path: '/ws/libs/ui/src/card.fud',
    });
  });

  it('takes an absolute href as written', () => {
    const io = fs({});
    expect(resolveHref(FROM, '/shared/card.fud', io)).toEqual({
      outcome: 'path',
      path: '/shared/card.fud',
    });
  });
});

describe('an external href', () => {
  it('is reported as external and not resolved', () => {
    const io = fs({});
    expect(resolveHref(FROM, 'https://cdn.example.com/card.fud', io)).toEqual({
      outcome: 'external',
      href: 'https://cdn.example.com/card.fud',
    });
  });
});

describe('a package href', () => {
  const RESOLVED = '/ws/libs/ui/src/card.fud';

  it('carries the package it came from, with its config', () => {
    const io = fs(
      {
        '/ws/libs/ui/package.json': '{"name":"@acme/ui"}',
        '/ws/libs/ui/fudic.json': '{"kind":"lib","prefix":"ui"}',
        [RESOLVED]: '<ui-card></ui-card>',
      },
      { '@acme/ui/card.fud': { ok: true, path: RESOLVED } },
    );

    const resolution = resolveHref(FROM, '@acme/ui/card.fud', io);
    expect(resolution).toEqual({
      outcome: 'package',
      path: RESOLVED,
      target: {
        name: '@acme/ui',
        root: '/ws/libs/ui',
        config: { id: '', kind: 'lib', prefix: 'ui', styles: [] },
      },
    });
  });

  it('carries a null config when the package has no fudic.json', () => {
    // What FUD0763 is about: a package that was never meant to be consumed this way.
    const io = fs(
      { '/ws/libs/ui/package.json': '{"name":"@acme/ui"}', [RESOLVED]: '' },
      { '@acme/ui/card.fud': { ok: true, path: RESOLVED } },
    );

    const resolution = resolveHref(FROM, '@acme/ui/card.fud', io);
    expect(resolution.outcome).toBe('package');
    if (resolution.outcome !== 'package') return;
    expect(resolution.target.config).toBeNull();
  });

  it('finds the package root by going up, not by asking for its manifest', () => {
    // A package that publishes `exports` need not export its own `package.json`, and most
    // do not — so the root has to come from the file, not from a second resolution.
    const deep = '/ws/libs/ui/src/components/nested/card.fud';
    const io = fs(
      { '/ws/libs/ui/package.json': '{"name":"@acme/ui"}', [deep]: '' },
      { '@acme/ui/nested/card.fud': { ok: true, path: deep } },
    );

    const resolution = resolveHref(FROM, '@acme/ui/nested/card.fud', io);
    if (resolution.outcome !== 'package') throw new Error('expected a package');
    expect(resolution.target.root).toBe('/ws/libs/ui');
  });

  it('degrades when the resolved file belongs to no package at all', () => {
    const orphan = '/elsewhere/card.fud';
    const io = fs({ [orphan]: '' }, { 'ui-kit/card.fud': { ok: true, path: orphan } });

    const resolution = resolveHref(FROM, 'ui-kit/card.fud', io);
    expect(resolution).toEqual({
      outcome: 'package',
      path: orphan,
      target: { name: 'ui-kit', root: '/elsewhere', config: null },
    });
  });

  it('reports a package that is not installed', () => {
    const io = fs({});
    expect(resolveHref(FROM, '@acme/ui/card.fud', io)).toEqual({
      outcome: 'unresolved',
      specifier: '@acme/ui/card.fud',
      reason: 'not-installed',
    });
  });

  it('reports a package that does not export the file', () => {
    const io = fs({}, { '@acme/ui/card.fud': { ok: false, reason: 'not-exported' } });
    expect(resolveHref(FROM, '@acme/ui/card.fud', io)).toEqual({
      outcome: 'unresolved',
      specifier: '@acme/ui/card.fud',
      reason: 'not-exported',
    });
  });
});

describe('resolveHrefPath', () => {
  it('answers the file for anything that resolved', () => {
    const io = fs(
      { '/ws/libs/ui/package.json': '{}', '/ws/libs/ui/src/card.fud': '' },
      { '@acme/ui/card.fud': { ok: true, path: '/ws/libs/ui/src/card.fud' } },
    );
    expect(resolveHrefPath(FROM, './card.fud', io)).toBe('/ws/apps/tienda/src/routes/card.fud');
    expect(resolveHrefPath(FROM, '@acme/ui/card.fud', io)).toBe('/ws/libs/ui/src/card.fud');
  });

  it('answers a path that does not exist for anything that did not', () => {
    // `ResolveIo.resolve` returns a string and the compiler walks the graph with it, so a
    // broken specifier has to degrade the way a broken relative link already does. The
    // reason lives in `resolveHref`, and the diagnostic is the host's.
    const io = fs({});
    expect(resolveHrefPath(FROM, '@acme/ui/card.fud', io)).toBe(
      '/ws/apps/tienda/src/routes/@acme/ui/card.fud',
    );
    expect(resolveHrefPath(FROM, 'https://cdn.example.com/card.fud', io)).toBe(
      '/ws/apps/tienda/src/routes/https:/cdn.example.com/card.fud',
    );
  });
});
