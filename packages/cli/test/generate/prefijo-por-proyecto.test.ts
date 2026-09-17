/**
 * Where a piece goes, and which prefix names it — criteria 7, 8, 9, 10 and 11.
 *
 * This is where SDD-41 and SDD-44 meet: `tagOf` is fed the config of the TARGET project, not
 * of `cwd`. The workspace below has two projects with different prefixes on purpose, because
 * one project can never show that the right one was read.
 */

import { describe, expect, it } from 'vitest';
import { planComponent } from '../../src/plans/component.js';
import { planPage } from '../../src/plans/page.js';
import { planLayout } from '../../src/plans/layout.js';
import { apply } from '../../src/apply.js';
import {
  FUD_NO_TARGET_PROJECT,
  FUD_PROJECT_UNKNOWN,
  FUD_ROUTE_IN_LIB,
} from '../../src/diagnostics.js';
import { FUD_CONFIG_MALFORMED } from '@fudic/config';
import { MemoryFs, RecordingRunner } from '../helpers.js';
import type { ComponentOptions, LayoutOptions, PageOptions } from '../../src/types.js';

const ROOT = '/ws';

const LAYOUT = `<!DOCTYPE html>
<html lang="en">
  <head>
    @RenderHead()
  </head>
  <body>
    <main>@RenderBody()</main>
  </body>
</html>
`;

/** A workspace with an app prefixed `ad` and a library prefixed `ui`. */
function workspace(extra: Readonly<Record<string, string>> = {}): MemoryFs {
  return new MemoryFs(
    {
      'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'libs/*'\n",
      'package.json': '{"name":"mi-tienda","private":true}',
      'apps/admin/fudic.json': '{"id":"admin","kind":"app","prefix":"ad"}',
      'apps/admin/src/layouts/_layout.fud': LAYOUT,
      'libs/ui/fudic.json': '{"kind":"lib","prefix":"ui"}',
      'libs/ui/package.json': '{"name":"@mi-tienda/ui"}',
      ...extra,
    },
    ROOT,
  );
}

function componentOptions(overrides: Partial<ComponentOptions> = {}): ComponentOptions {
  return { cwd: ROOT, force: false, dir: 'src/components', wireInto: [], style: true, slot: false, ...overrides };
}

function pageOptions(overrides: Partial<PageOptions> = {}): PageOptions {
  return { cwd: ROOT, force: false, dir: 'src/routes', server: false, sections: null, ...overrides };
}

function layoutOptions(overrides: Partial<LayoutOptions> = {}): LayoutOptions {
  return { cwd: ROOT, force: false, dir: 'src/layouts', sections: [], head: true, ...overrides };
}

describe('the prefix of the target project (criteria 7 and 8)', () => {
  it('cd apps/admin && fudic g component card writes ad-card, in that app', async () => {
    const plan = await planComponent('card', componentOptions({ cwd: `${ROOT}/apps/admin` }), workspace());

    expect(plan.errors).toEqual([]);
    expect(plan.changes[0]?.path).toBe('src/components/ad-card.fud');
    expect(plan.changes[0]?.contents).toContain('<ad-card>');
  });

  it('--project ui from the root writes ui-card, in the library', async () => {
    const plan = await planComponent('card', componentOptions({ project: 'ui' }), workspace());

    expect(plan.errors).toEqual([]);
    expect(plan.changes[0]?.path).toBe('libs/ui/src/components/ui-card.fud');
    expect(plan.changes[0]?.contents).toContain('<ui-card>');
  });

  it('--project reaches a sibling from inside another project', async () => {
    const plan = await planComponent(
      'card',
      componentOptions({ cwd: `${ROOT}/apps/admin`, project: 'ui' }),
      workspace(),
    );

    expect(plan.changes[0]?.path).toBe('../../libs/ui/src/components/ui-card.fud');
  });

  it('the tag already taken is looked for in the target project, not in the whole tree', async () => {
    const fs = workspace({
      'apps/admin/src/components/ad-card.fud':
        '<ad-card>\n  <template shadowrootmode="open"></template>\n</ad-card>\n',
    });

    // The same name in the library is free: its tag is `ui-card`, and `ad-card` is not there.
    const plan = await planComponent('card', componentOptions({ project: 'ui' }), fs);

    expect(plan.errors).toEqual([]);
  });
});

describe('when no project answers (criteria 9 and 10)', () => {
  it('--project noexiste is FUD0782, and names the ones there are', async () => {
    const plan = await planComponent('card', componentOptions({ project: 'noexiste' }), workspace());

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_PROJECT_UNKNOWN);
    expect(plan.errors[0]?.message).toContain('admin');
    expect(plan.errors[0]?.message).toContain('ui');
  });

  it('--project works outside a workspace too, sweeping from cwd', async () => {
    const fs = new MemoryFs({ 'libs/ui/fudic.json': '{"kind":"lib","prefix":"ui"}' }, ROOT);

    const plan = await planComponent('card', componentOptions({ project: 'ui' }), fs);

    expect(plan.changes[0]?.path).toBe('libs/ui/src/components/ui-card.fud');
  });

  it('says there are none when there is nothing to list', async () => {
    const fs = new MemoryFs({ 'README.md': '#' }, ROOT);

    const plan = await planComponent('card', componentOptions({ project: 'ui' }), fs);

    expect(plan.errors[0]?.code).toBe(FUD_PROJECT_UNKNOWN);
    expect(plan.errors[0]?.message).toContain('there are none here');
  });

  it('from the workspace root, with no --project, is FUD0781 and writes nothing', async () => {
    const fs = workspace();
    const plan = await planComponent('card', componentOptions(), fs);

    expect(plan.changes).toEqual([]);
    expect(plan.errors.map((error) => error.code)).toEqual([FUD_NO_TARGET_PROJECT]);

    await apply(plan, componentOptions(), fs, new RecordingRunner());
    expect(fs.paths().some((path) => path.endsWith('card.fud'))).toBe(false);
  });

  it('page and layout refuse there too: there is no default project', async () => {
    expect((await planPage('/alta', pageOptions(), workspace())).errors[0]?.code).toBe(
      FUD_NO_TARGET_PROJECT,
    );
    expect((await planLayout('base', layoutOptions(), workspace())).errors[0]?.code).toBe(
      FUD_NO_TARGET_PROJECT,
    );
  });

  it('a fudic.json that does not read says so, instead of "no project found"', async () => {
    const fs = workspace({ 'apps/admin/fudic.json': '{ not json' });

    const plan = await planComponent('card', componentOptions({ cwd: `${ROOT}/apps/admin` }), fs);

    expect(plan.changes).toEqual([]);
    expect(plan.errors[0]?.code).toBe(FUD_CONFIG_MALFORMED);
    expect(plan.errors[0]?.file).toBe('fudic.json');
  });
});

describe('a route does not fit in a library (criterion 11)', () => {
  it('fudic g page --project ui is FUD0783', async () => {
    const plan = await planPage('/alta', pageOptions({ project: 'ui' }), workspace());

    expect(plan.changes).toEqual([]);
    expect(plan.errors.map((error) => error.code)).toEqual([FUD_ROUTE_IN_LIB]);
  });

  it('fudic g layout --project ui is legal, and writes the layout (§4.8)', async () => {
    const plan = await planLayout('base', layoutOptions({ project: 'ui' }), workspace());

    expect(plan.errors).toEqual([]);
    expect(plan.changes[0]?.path).toBe('libs/ui/src/layouts/base.fud');
  });

  it('a page in an app still works, against that app’s own layout', async () => {
    const plan = await planPage('/alta', pageOptions({ project: 'admin' }), workspace());

    expect(plan.errors).toEqual([]);
    expect(plan.changes[0]?.path).toBe('apps/admin/src/routes/alta.fud');
    expect(plan.changes[0]?.contents).toContain('rel="layout"');
  });
});
