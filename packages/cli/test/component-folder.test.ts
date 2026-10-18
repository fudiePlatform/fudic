/**
 * BUG-50 §4.3, §6.5, §6.7 — a component is a folder: the `.fud`, its unit test, its `.fudspec`
 * and the fixture the criteria mount it with, and the command says what it made and how to run
 * it. Read from what the binary writes and prints, over the workspace of §6.2–§6.4.
 */

import { describe, expect, it } from 'vitest';
import { planComponent } from '../src/plans/component.js';
import { run } from '../src/run.js';
import { componentFixture, componentSpec, componentTest } from '../src/templates.js';
import { captureStreams, MemoryFs, RecordingRunner } from './helpers.js';
import type { ComponentOptions } from '../src/types.js';

const ROOT = '/w';
const SHOP = `${ROOT}/shop`;

interface Ran {
  readonly code: number;
  readonly out: string;
  readonly err: string;
}

async function cli(fs: MemoryFs, ...argv: string[]): Promise<Ran> {
  const capture = captureStreams();
  const code = await run(argv, { readIo: fs, writeIo: fs, runner: new RecordingRunner(), streams: capture.streams });
  return { code, out: capture.stdout(), err: capture.stderr() };
}

/** `fudic new shop --workspace --app web` and `fudic g lib ui`, as §6.2 and §6.3. */
async function shop(): Promise<MemoryFs> {
  const fs = new MemoryFs({}, ROOT);
  expect((await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', ROOT)).code).toBe(0);
  expect((await cli(fs, 'g', 'lib', 'ui', '--cwd', SHOP)).code).toBe(0);
  return fs;
}

const FOLDER = 'shop/libs/ui/src/components/ui-button';

describe('fudic g component button --project ui (§6.5)', () => {
  it('says what it created, how to run each file and how an app links it — exactly', async () => {
    const fs = await shop();
    const { code, out } = await cli(fs, 'g', 'component', 'button', '--project', 'ui', '--cwd', SHOP);
    expect(code).toBe(0);
    expect(out).toBe(`
Created <ui-button> in libs/ui/src/components/ui-button/

  ui-button.fud           the component
  ui-button.test.ts       unit test               pnpm --filter ui test
  ui-button.fudspec       acceptance criteria     pnpm --filter ui spec
  ui-button.fixture.ts    the props the criteria mount it with

Use it in an app
  <link rel="component" href="@shop/ui/ui-button.fud">
`);
  });

  it('writes the four files of §6.5, exactly', async () => {
    const fs = await shop();
    await cli(fs, 'g', 'component', 'button', '--project', 'ui', '--cwd', SHOP);

    expect(fs.paths().filter((path) => path.startsWith(`${FOLDER}/`))).toEqual([
      `${FOLDER}/ui-button.fixture.ts`,
      `${FOLDER}/ui-button.fud`,
      `${FOLDER}/ui-button.fudspec`,
      `${FOLDER}/ui-button.test.ts`,
    ]);
    expect(fs.at(`${FOLDER}/ui-button.fud`)).toBe(`<head>
  <style></style>
</head>

<ui-button>
  <template shadowrootmode="open">
  </template>
</ui-button>
`);
    // `present`, not the `visible` of §6.5's first draft: an empty component takes no room.
    expect(fs.at(`${FOLDER}/ui-button.fudspec`)).toBe(`component ui-button

criterion renders
  given
    props base
  then
    present ui-button
`);
    expect(fs.at(`${FOLDER}/ui-button.fixture.ts`)).toBe(`import type { Fixtures } from '@fudic/terms';
import type { $Props } from './ui-button.fud';

export default {
  base: {},
} satisfies Fixtures<$Props>;
`);
    expect(fs.at(`${FOLDER}/ui-button.test.ts`)).toBe(`import { expect, test } from 'vitest';
import { mount } from '@fudic/testing';
import * as UiButton from './ui-button.fud';

test('renders', async () => {
  const t = await mount(UiButton);
  expect(t.host).toBeInTheDocument();
});
`);
  });

  it('builds each file from the tag', () => {
    expect(componentTest('shop-big-card')).toContain("import * as ShopBigCard from './shop-big-card.fud';");
    expect(componentSpec('shop-big-card')).toContain('present shop-big-card');
    expect(componentFixture('shop-big-card')).toContain("from './shop-big-card.fud';");
  });

  it('exports the component from the library without repeating its folder', async () => {
    const fs = await shop();
    const pkg = JSON.parse(fs.at('shop/libs/ui/package.json')) as { exports: Record<string, string> };
    expect(pkg.exports['./*.fud']).toBe('./src/components/*/*.fud');
  });

  it('removes the .gitkeep with the first component, and only from src/components', async () => {
    const fs = await shop();
    expect(fs.paths()).toContain('shop/libs/ui/src/components/.gitkeep');

    const elsewhere = await cli(fs, 'g', 'component', 'icon', '--project', 'ui', '--dir', 'src/widgets', '--cwd', SHOP);
    expect(elsewhere.code).toBe(0);
    expect(fs.paths()).toContain('shop/libs/ui/src/components/.gitkeep');

    await cli(fs, 'g', 'component', 'button', '--project', 'ui', '--cwd', SHOP);
    expect(fs.paths()).not.toContain('shop/libs/ui/src/components/.gitkeep');

    // The second one has nothing left to remove.
    const second = await planComponent('badge', options({ cwd: SHOP, project: 'ui' }), fs);
    expect(second.deletions).toBeUndefined();
  });

  it('lists the .gitkeep it would remove under --dry-run, and writes nothing', async () => {
    const fs = await shop();
    const before = fs.paths();
    const { code, out } = await cli(fs, 'g', 'component', 'button', '--project', 'ui', '--cwd', SHOP, '--dry-run');
    expect(code).toBe(0);
    expect(out).toContain('libs/ui/src/components/.gitkeep');
    expect(out).not.toContain('Created <ui-button>');
    expect(fs.paths()).toEqual(before);
  });
});

function options(overrides: Partial<ComponentOptions> = {}): ComponentOptions {
  return { cwd: SHOP, force: false, dir: 'src/components', wireInto: [], style: true, slot: false, test: true, spec: true, ...overrides };
}

describe('fudic g component --dir (§6.7)', () => {
  it('a component of a route: the short form, and the reminder that it is not a page — exactly', async () => {
    const fs = await shop();
    const { code, out } = await cli(fs, 'g', 'component', 'web-post-meta', '--project', 'web', '--dir', 'src/routes/blog/components', '--cwd', SHOP);
    expect(code).toBe(0);
    expect(out).toBe(`
Created <web-post-meta> in apps/web/src/routes/blog/components/web-post-meta/
  web-post-meta.fud · .test.ts · .fudspec · .fixture.ts
  A component under src/routes is not a route: only pages are.
`);
    expect(fs.paths()).toContain('shop/apps/web/src/routes/blog/components/web-post-meta/web-post-meta.fudspec');
  });

  it('elsewhere: the short form alone, with only the files it wrote', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'component', 'chip', '--project', 'web', '--dir', 'src/widgets', '--skip-test', '--cwd', SHOP);
    expect(out).toBe(`
Created <web-chip> in apps/web/src/widgets/web-chip/
  web-chip.fud · .fudspec · .fixture.ts
`);
  });

  it('takes --dir from the project, whatever folder it runs in', async () => {
    const fs = await shop();
    expect((await cli(fs, 'g', 'component', 'chip', '--dir', 'src/widgets', '--cwd', `${SHOP}/apps/web/src/routes`)).code).toBe(0);
    expect(fs.paths()).toContain('shop/apps/web/src/widgets/web-chip/web-chip.fud');
  });
});

describe('what g component says, project by project', () => {
  it('in an app of the workspace: its commands, filtered, and no link to give', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'component', 'card', '--project', 'web', '--cwd', SHOP);
    expect(out).toContain('  web-card.test.ts        unit test               pnpm --filter web test\n');
    expect(out).toContain('  web-card.fudspec        acceptance criteria     pnpm --filter web spec\n');
    expect(out).not.toContain('Use it in an app');
  });

  it('in a standalone app: pnpm test and pnpm spec', async () => {
    const fs = new MemoryFs({}, ROOT);
    await cli(fs, 'new', 'solo', '--cwd', ROOT);
    const { out } = await cli(fs, 'g', 'component', 'card', '--cwd', `${ROOT}/solo`);
    expect(out).toBe(`
Created <solo-card> in src/components/solo-card/

  solo-card.fud           the component
  solo-card.test.ts       unit test               pnpm test
  solo-card.fudspec       acceptance criteria     pnpm spec
  solo-card.fixture.ts    the props the criteria mount it with
`);
  });

  it('--skip-test and --skip-spec leave out their files and their rows', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'component', 'card', '--project', 'web', '--skip-test', '--skip-spec', '--cwd', SHOP);
    expect(out).toBe(`
Created <web-card> in apps/web/src/components/web-card/

  web-card.fud            the component
`);
    expect(fs.paths().filter((path) => path.includes('/web-card/'))).toEqual(['shop/apps/web/src/components/web-card/web-card.fud']);
  });

  it('widens the first column for a long name, two spaces after it', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'component', 'web-navigation-drawer', '--project', 'web', '--cwd', SHOP);
    expect(out).toContain('  web-navigation-drawer.fixture.ts  the props the criteria mount it with\n');
    expect(out).toContain('  web-navigation-drawer.fud         the component\n');
  });

  it('says where it linked it from, for each --in', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'component', 'card', '--project', 'web', '--in', 'apps/web/src/routes/index.fud', '--cwd', SHOP);
    expect(out).toContain('\n  linked from apps/web/src/routes/index.fud\n');
    expect(fs.at('shop/apps/web/src/routes/index.fud')).toContain('<link rel="component" href="../components/web-card/web-card.fud">');
  });

  it('in a library, has no link to give for a folder its exports do not list', async () => {
    const fs = await shop();
    const { out } = await cli(fs, 'g', 'component', 'icon', '--project', 'ui', '--dir', 'src/widgets', '--cwd', SHOP);
    expect(out).not.toContain('Use it in an app');
  });

  it('in a library with no package.json, has no link to give either', async () => {
    const fs = new MemoryFs({ 'lib/fudic.json': '{"kind":"lib","prefix":"ui"}' }, ROOT);
    const { code, out } = await cli(fs, 'g', 'component', 'card', '--cwd', `${ROOT}/lib`);
    expect(code).toBe(0);
    expect(out).not.toContain('Use it in an app');
  });

  it('prints only JSON under --json', async () => {
    const fs = await shop();
    const { code, out } = await cli(fs, 'g', 'component', 'card', '--project', 'web', '--json', '--cwd', SHOP);
    expect(code).toBe(0);
    expect(() => JSON.parse(out) as unknown).not.toThrow();
    expect(out).not.toContain('Created');
  });
});
