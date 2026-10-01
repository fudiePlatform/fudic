/**
 * `--in` across packages (SDD-35, SDD-44 §4.7): the library's name, never a path out of the app.
 *
 * A path that climbs out of the consumer reaches a file the editor and the build do not index,
 * which is `FUD0460` in both and, since SDD-35, a build that fails. So the link is the specifier
 * the library's `exports` give the file, and the consumer is made to declare the library.
 */

import { describe, expect, it } from 'vitest';
import { planComponent } from '../../src/plans/component.js';
import { componentLink } from '../../src/workspace/link.js';
import { MemoryFs } from '../helpers.js';
import type { ComponentOptions } from '../../src/types.js';

const ROOT = '/ws';

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">

<h1>hi</h1>
`;

const LIB_PACKAGE = JSON.stringify({ name: '@mi-tienda/ui', exports: { './*.fud': './src/components/*.fud' } });

function workspace(webPackage: string, extra: Readonly<Record<string, string>> = {}): MemoryFs {
  return new MemoryFs(
    {
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
      'package.json': '{"name":"mi-tienda","private":true}',
      'apps/web/fudic.json': '{"id":"web","kind":"app","prefix":"web"}',
      'apps/web/package.json': webPackage,
      'apps/web/src/routes/index.fud': ROUTE,
      'libs/ui/fudic.json': '{"kind":"lib","prefix":"ui"}',
      'libs/ui/package.json': LIB_PACKAGE,
      ...extra,
    },
    ROOT,
  );
}

const WEB = '{\n  "name": "@mi-tienda/web",\n  "dependencies": {\n    "@fudic/core": "1.0.0"\n  }\n}\n';

function options(overrides: Partial<ComponentOptions> = {}): ComponentOptions {
  return {
    cwd: ROOT,
    force: false,
    dir: 'src/components',
    project: 'ui',
    wireInto: ['apps/web/src/routes/index.fud'],
    style: false,
    slot: false,
    ...overrides,
  };
}

describe('fudic g component --project <lib> --in <a file of an app>', () => {
  it('links by the library name and adds the dependency, touching only its line', async () => {
    const plan = await planComponent('card', options(), workspace(WEB));

    expect(plan.errors).toEqual([]);
    const route = plan.changes.find((change) => change.path === 'apps/web/src/routes/index.fud');
    expect(route?.contents).toContain('<link rel="component" href="@mi-tienda/ui/ui-card.fud">');
    const manifest = plan.changes.find((change) => change.path === 'apps/web/package.json');
    expect(manifest?.contents).toBe(
      '{\n  "name": "@mi-tienda/web",\n  "dependencies": {\n    "@mi-tienda/ui": "workspace:*",\n    "@fudic/core": "1.0.0"\n  }\n}\n',
    );
    expect(JSON.parse(manifest!.contents)).toBeTruthy();
  });

  it('wires two files of one app with one edit of its package.json', async () => {
    const fs = workspace(WEB, { 'apps/web/src/routes/about.fud': ROUTE });
    const plan = await planComponent(
      'card',
      options({ wireInto: ['apps/web/src/routes/index.fud', 'apps/web/src/routes/about.fud'] }),
      fs,
    );

    expect(plan.changes.filter((change) => change.path === 'apps/web/package.json')).toHaveLength(1);
  });

  it('is FUD0787, and wires nothing, for a folder the library does not export', async () => {
    const plan = await planComponent('card', options({ dir: 'src/internal' }), workspace(WEB));

    expect(plan.errors.map((error) => error.code)).toEqual(['FUD0787']);
    expect(plan.changes.some((change) => change.path === 'apps/web/src/routes/index.fud')).toBe(false);
  });
});

describe('componentLink', () => {
  const link = (fs: MemoryFs, into = 'apps/web/src/routes/index.fud', component = 'libs/ui/src/components/ui-card.fud') =>
    componentLink(into, component, ROOT, fs);
  const manifestOf = (result: ReturnType<typeof link>): string | undefined =>
    'href' in result ? result.dependency?.contents : undefined;

  it('is a path inside one package', () => {
    expect(link(workspace(WEB), 'apps/web/src/routes/index.fud', 'apps/web/src/components/web-card.fud')).toEqual({
      href: '../components/web-card.fud',
    });
  });

  it('is a path when either side belongs to no package at all', () => {
    const fs = new MemoryFs({ 'a/index.fud': ROUTE }, ROOT);
    expect(link(fs, 'a/index.fud', 'b/x-card.fud')).toEqual({ href: '../b/x-card.fud' });
  });

  it('adds nothing when the consumer already declares the library, wherever it does', () => {
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      const fs = workspace(JSON.stringify({ name: 'web', [field]: { '@mi-tienda/ui': 'workspace:*' } }));
      expect(link(fs)).toEqual({ href: '@mi-tienda/ui/ui-card.fud' });
    }
  });

  it('fills an empty dependencies block', () => {
    const contents = manifestOf(link(workspace('{\n  "name": "web",\n  "dependencies": {}\n}\n')));
    expect(contents).toBe('{\n  "name": "web",\n  "dependencies": {\n    "@mi-tienda/ui": "workspace:*"\n  }\n}\n');
  });

  it('opens a dependencies block when there is none', () => {
    const contents = manifestOf(link(workspace('{\n  "name": "web"\n}\n')));
    expect(contents).toBe('{\n  "name": "web",\n  "dependencies": {\n    "@mi-tienda/ui": "workspace:*"\n  }\n}\n');
  });

  it("names a library that declares no name by its folder, and reads a broken manifest as empty", () => {
    const fs = workspace('not json {}', { 'libs/ui/package.json': '[]' });
    const result = link(fs);
    expect(result).toMatchObject({ href: 'ui/src/components/ui-card.fud' });
    expect(manifestOf(result)).toContain('"ui": "workspace:*"');
    expect(link(workspace('42', { 'libs/ui/package.json': 'null' }))).toMatchObject({ href: 'ui/src/components/ui-card.fud' });
  });
});
