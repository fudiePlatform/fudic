/**
 * `errorPageOf` — which error page a project paints with (SDD-87 §3.2, §3.3, §4.1, criterion 12).
 *
 * The app's own wins and its chain is not looked at; without it, the one library of the chain
 * that offers `src/_error.fud`; two or more is `ambiguous`, never an order. A library never
 * looks at its chain: it offers a page, it does not paint one.
 */

import { describe, expect, it } from 'vitest';
import { errorPageOf, LIBRARY_ERROR_FILE, type ErrorPageSource } from '../src/index.js';
import type { PackageFs } from '../src/libraries.js';

const PAGE = '<h1>@data.status</h1>\n';
const APP = '/ws/apps/admin';
const UI = '/ws/libs/ui';
const MARKETING = '/ws/libs/marketing';
const BASE_UI = '/ws/libs/base-ui';

const manifest = (name: string, deps: readonly string[] = []): string =>
  JSON.stringify({ name, version: '1.0.0', dependencies: Object.fromEntries(deps.map((d) => [d, 'workspace:*'])) });

const APP_CONFIG = JSON.stringify({ kind: 'app', prefix: 'adm' });
const lib = (prefix: string): string => JSON.stringify({ kind: 'lib', prefix });

/** A `PackageFs` over a map; `links` are the workspace's symlinks, `node_modules` → the real folder. */
function memoryFs(files: Readonly<Record<string, string>>, links: Readonly<Record<string, string>> = {}): PackageFs {
  return {
    readFile: (path) => files[path],
    realPath: (path) => links[path] ?? path,
  };
}

/** A workspace: `admin` depends on `deps`; each library is installed as a link under its node_modules. */
function workspace(deps: readonly string[], extra: Readonly<Record<string, string>> = {}): PackageFs {
  const libs: Record<string, { root: string; deps: readonly string[] }> = {
    '@acme/ui': { root: UI, deps: ['@acme/base-ui'] },
    '@acme/marketing': { root: MARKETING, deps: [] },
    '@acme/base-ui': { root: BASE_UI, deps: [] },
  };
  const files: Record<string, string> = {
    [`${APP}/package.json`]: manifest('@acme/admin', deps),
    [`${APP}/fudic.json`]: APP_CONFIG,
  };
  const links: Record<string, string> = {};
  for (const [name, { root, deps: own }] of Object.entries(libs)) {
    files[`${root}/package.json`] = manifest(name, own);
    files[`${root}/fudic.json`] = lib(name.slice(6, 8));
    // Each package finds its dependencies in its own node_modules, a link to the real folder.
    for (const owner of [APP, UI, MARKETING, BASE_UI]) {
      const installed = `${owner}/node_modules/${name}`;
      files[`${installed}/package.json`] = files[`${root}/package.json`]!;
      links[installed] = root;
    }
  }
  return memoryFs({ ...files, ...extra }, links);
}

const of = (fs: PackageFs, root = APP, routesDir = 'src/routes'): ErrorPageSource => errorPageOf(root, routesDir, fs);

describe('errorPageOf in an app (criterion 12)', () => {
  it('its own src/routes/_error.fud wins over the one of a library of its chain', () => {
    const fs = workspace(['@acme/ui'], { [`${APP}/src/routes/_error.fud`]: PAGE, [`${UI}/src/_error.fud`]: PAGE });
    expect(of(fs)).toEqual({ kind: 'own', file: `${APP}/src/routes/_error.fud` });
  });

  it('without its own, the one of a library, with the name of its package', () => {
    const fs = workspace(['@acme/ui'], { [`${UI}/src/_error.fud`]: PAGE });
    expect(of(fs)).toEqual({ kind: 'library', file: `${UI}/src/_error.fud`, package: '@acme/ui' });
  });

  it('a library two hops away (app → ui → base-ui) counts', () => {
    const fs = workspace(['@acme/ui'], { [`${BASE_UI}/src/_error.fud`]: PAGE });
    expect(of(fs)).toEqual({ kind: 'library', file: `${BASE_UI}/src/_error.fud`, package: '@acme/base-ui' });
  });

  it('a library _error.fud anywhere but src/ is nobody’s error page', () => {
    const fs = workspace(['@acme/ui'], { [`${UI}/src/components/_error.fud`]: PAGE, [`${UI}/_error.fud`]: PAGE });
    expect(of(fs)).toEqual({ kind: 'none' });
  });

  it('two libraries: ambiguous, in the order of the chain', () => {
    const fs = workspace(['@acme/marketing', '@acme/ui'], {
      [`${MARKETING}/src/_error.fud`]: PAGE,
      [`${BASE_UI}/src/_error.fud`]: PAGE,
    });
    // dependencyChain is post-order: marketing, then base-ui (before ui, which depends on it).
    expect(of(fs)).toEqual({
      kind: 'ambiguous',
      libraries: [
        { file: `${MARKETING}/src/_error.fud`, package: '@acme/marketing' },
        { file: `${BASE_UI}/src/_error.fud`, package: '@acme/base-ui' },
      ],
    });
  });

  it('two libraries do not matter when the app has its own', () => {
    const fs = workspace(['@acme/marketing', '@acme/ui'], {
      [`${APP}/src/routes/_error.fud`]: PAGE,
      [`${MARKETING}/src/_error.fud`]: PAGE,
      [`${UI}/src/_error.fud`]: PAGE,
    });
    expect(of(fs)).toEqual({ kind: 'own', file: `${APP}/src/routes/_error.fud` });
  });

  it('none: no page of its own and none in its chain', () => {
    expect(of(workspace(['@acme/ui']))).toEqual({ kind: 'none' });
  });

  it('a library the app does not depend on is not in its chain', () => {
    const fs = workspace(['@acme/ui'], { [`${MARKETING}/src/_error.fud`]: PAGE });
    expect(of(fs)).toEqual({ kind: 'none' });
  });

  it('the routesDir of the app, however it is spelled', () => {
    const fs = workspace([], { [`${APP}/src/pages/_error.fud`]: PAGE });
    for (const dir of ['src/pages', './src/pages', 'src/pages/', './src/pages/']) {
      expect(of(fs, APP, dir)).toEqual({ kind: 'own', file: `${APP}/src/pages/_error.fud` });
    }
    expect(of(fs, APP, 'src/routes')).toEqual({ kind: 'none' });
  });

  it('a Windows root and a linked root give the same absolute POSIX files', () => {
    const fs = memoryFs(
      {
        'C:/ws/apps/admin/package.json': manifest('@acme/admin'),
        'C:/ws/apps/admin/fudic.json': APP_CONFIG,
        'C:/ws/apps/admin/src/routes/_error.fud': PAGE,
      },
      { 'C:/link/admin': 'C:/ws/apps/admin' },
    );
    const own = { kind: 'own', file: 'C:/ws/apps/admin/src/routes/_error.fud' };
    expect(errorPageOf('C:\\ws\\apps\\admin', 'src/routes', fs)).toEqual(own);
    expect(errorPageOf('C:/link/admin', 'src/routes', fs)).toEqual(own);
  });

  it('a project without fudic.json is an app: its routesDir is looked at', () => {
    const fs = memoryFs({ [`${APP}/package.json`]: manifest('@acme/admin'), [`${APP}/src/routes/_error.fud`]: PAGE });
    expect(of(fs)).toEqual({ kind: 'own', file: `${APP}/src/routes/_error.fud` });
  });
});

describe('errorPageOf in a library', () => {
  it('its own src/_error.fud, without looking at its chain', () => {
    const fs = workspace([], { [`${UI}/src/_error.fud`]: PAGE, [`${BASE_UI}/src/_error.fud`]: PAGE });
    expect(of(fs, UI)).toEqual({ kind: 'own', file: `${UI}/src/_error.fud` });
  });

  it('none without one, even when its chain offers one: a library offers, it does not paint', () => {
    const fs = workspace([], { [`${BASE_UI}/src/_error.fud`]: PAGE, [`${UI}/src/routes/_error.fud`]: PAGE });
    expect(of(fs, UI)).toEqual({ kind: 'none' });
  });

  it('LIBRARY_ERROR_FILE is where it lives', () => {
    expect(LIBRARY_ERROR_FILE).toBe('src/_error.fud');
  });
});
