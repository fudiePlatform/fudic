/**
 * `fudic g spec <component>` (SDD-53 §4.1) — criteria 7–10 and 12.
 *
 * The plan is checked over a `MemoryFs` with the props reader injected; one run over a real
 * project on disk exercises the default reader, which builds the project's TypeScript program.
 */

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMPONENTS_DIR } from '@fudic/conventions';
import { fixtureModule, specSkeleton, type PropField } from '@fudic/spec';
import { parseArgs } from '../src/args.js';
import { nodeReadIo, nodeWriteIo } from '../src/io.js';
import { planComponent } from '../src/plans/component.js';
import { ENV_DECLARATION, ENV_FILE, planSpec, type PropsReader } from '../src/plans/spec.js';
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, projectFs, RecordingRunner } from './helpers.js';
import type { ComponentOptions, SpecOptions } from '../src/types.js';

const CWD = '/project';

/** An absolute path as the plan hands it on: resolved on this platform, POSIX. */
const posix = (path: string): string => resolve(path).replace(/\\/gu, '/');
const CONFIG = { id: 'demo', kind: 'app', prefix: 'app' };

/** A component `.fud` whose host is `tag` and whose props are `type`. */
function component(tag: string, type = '{}'): string {
  return `@code {
  const p = props<${type}>();
}

<${tag}>
  <template shadowrootmode="open">
    <span><slot></slot></span>
  </template>
</${tag}>
`;
}

const PAGE = '<!DOCTYPE html>\n<html lang="en">\n  <body>\n    <h1>hi</h1>\n  </body>\n</html>\n';

const CARD_TYPE = "{ title: string; href: string; variant?: 'default' | 'highlight' }";
const PROPS: readonly PropField[] = [
  { name: 'title', required: true, shape: { kind: 'string' } },
  { name: 'href', required: true, shape: { kind: 'string' } },
  {
    name: 'variant',
    required: false,
    shape: {
      kind: 'union',
      members: [
        { kind: 'literal', value: 'default' },
        { kind: 'literal', value: 'highlight' },
      ],
    },
  },
];

const FIXTURE = fixtureModule('app-card', ['base'], PROPS);

/** A project with `app-card` (props) and a route, plus `extra`. */
function project(extra: Readonly<Record<string, string>> = {}): MemoryFs {
  return projectFs(
    { 'src/components/app-card.fud': component('app-card', CARD_TYPE), 'src/routes/index.fud': PAGE, ...extra },
    CWD,
    CONFIG,
  );
}

/** A reader that answers `fields` and remembers what it was asked. */
function reader(fields: readonly PropField[] | undefined): PropsReader & { calls: (readonly [string, string])[] } {
  const calls: (readonly [string, string])[] = [];
  return Object.assign(
    (root: string, file: string) => {
      calls.push([root, file]);
      return Promise.resolve(fields);
    },
    { calls },
  );
}

const options = (over: Partial<SpecOptions> = {}): SpecOptions => ({ cwd: CWD, force: false, ...over });

const created = (plan: { readonly changes: readonly { readonly kind: string; readonly path: string }[] }) =>
  plan.changes.map((change) => `${change.kind} ${change.path}`);

describe('parseArgs g spec', () => {
  it('reads `g spec <component>` and its alias, with --project', () => {
    expect(parseArgs(['g', 'spec', 'card'])).toMatchObject({ kind: 'spec', name: 'card' });
    expect(parseArgs(['g', 's', 'app-card', '--project', 'ui'])).toMatchObject({
      kind: 'spec',
      name: 'app-card',
      opts: { project: 'ui' },
    });
  });

  it('rejects a flag it does not take', () => {
    expect(parseArgs(['g', 'spec', 'card', '--param', 'a:string']).kind).toBe('error');
  });
});

describe('g spec (criterion 7)', () => {
  it('writes the .fudspec, the fixture filled by type and the *.fud declaration', async () => {
    const props = reader(PROPS);
    const plan = await planSpec('app-card', options(), project(), props);

    expect(plan.errors).toEqual([]);
    expect(created(plan)).toEqual([
      'create src/components/app-card.fudspec',
      'create src/components/app-card.fixture.ts',
      `create ${ENV_FILE}`,
    ]);
    const [spec, fixture, env] = plan.changes;
    expect(spec?.contents).toBe(specSkeleton('app-card', true));
    expect(spec?.contents).toContain('#     props base\n');
    expect(fixture?.contents).toBe(FIXTURE);
    expect(fixture?.contents).toContain("  base: { title: '', href: '' },\n");
    expect(env?.contents).toBe(ENV_DECLARATION);
    expect(props.calls).toEqual([[posix('/project'), posix('/project/src/components/app-card.fud')]]);
  });

  it('finds the component by its name without the prefix', async () => {
    const plan = await planSpec('card', options(), project(), reader(PROPS));
    expect(plan.changes[0]?.path).toBe('src/components/app-card.fudspec');
  });

  it('finds a component at the root of the project', async () => {
    const fs = projectFs({ 'app-root.fud': component('app-root') }, CWD, CONFIG);
    const plan = await planSpec('root', options(), fs, reader([]));
    expect(created(plan)).toEqual(['create app-root.fudspec']);
  });

  it('goes to the project named by --project, with its prefix', async () => {
    const fs = new MemoryFs(
      {
        'pnpm-workspace.yaml': "packages:\n  - 'libs/*'\n",
        'package.json': '{"name":"shop","private":true}',
        'libs/ui/fudic.json': '{"kind":"lib","prefix":"ui"}',
        'libs/ui/package.json': '{"name":"@shop/ui"}',
        'libs/ui/src/components/ui-card.fud': component('ui-card', CARD_TYPE),
      },
      '/ws',
    );
    const props = reader(PROPS);
    const plan = await planSpec('card', { cwd: '/ws', force: false, project: 'ui' }, fs, props);

    expect(plan.errors).toEqual([]);
    expect(created(plan)).toEqual([
      'create libs/ui/src/components/ui-card.fudspec',
      'create libs/ui/src/components/ui-card.fixture.ts',
      'create libs/ui/src/fudic-env.d.ts',
    ]);
    expect(props.calls).toEqual([[posix('/ws/libs/ui'), posix('/ws/libs/ui/src/components/ui-card.fud')]]);
  });
});

describe('g spec without props (criterion 8)', () => {
  it('writes only the .fudspec, without `props base`, when no prop is required', async () => {
    const optional: readonly PropField[] = [{ name: 'tone', required: false, shape: { kind: 'string' } }];
    for (const fields of [optional, [], undefined]) {
      const plan = await planSpec('app-card', options(), project(), reader(fields));
      expect(created(plan)).toEqual(['create src/components/app-card.fudspec']);
      expect(plan.changes[0]?.contents).toBe(specSkeleton('app-card', false));
      expect(plan.changes[0]?.contents).not.toContain('props base');
    }
  });
});

describe('g spec over what already exists (criterion 9)', () => {
  it('keeps an existing fixture, and writes no declaration for it', async () => {
    const fs = project({ 'src/components/app-card.fixture.ts': 'export default { mine: {} };\n' });
    const plan = await planSpec('app-card', options(), fs, reader(PROPS));
    expect(created(plan)).toEqual(['create src/components/app-card.fudspec']);
  });

  it('refuses an existing .fudspec with FUD0443, and replaces it with --force', async () => {
    const fs = project({ 'src/components/app-card.fudspec': 'component app-card\n' });

    const refused = await planSpec('app-card', options(), fs, reader(PROPS));
    expect(refused.errors.map((error) => error.code)).toEqual(['FUD0443']);
    expect(created(refused)).not.toContain('create src/components/app-card.fudspec');

    const forced = await planSpec('app-card', options({ force: true }), fs, reader(PROPS));
    expect(forced.errors).toEqual([]);
    expect(created(forced)[0]).toBe('modify src/components/app-card.fudspec');
  });

  it('writes no fudic-env.d.ts when a .d.ts under src/ already declares *.fud', async () => {
    const fs = project({
      'src/types/other.d.ts': 'declare module "*.css";\n',
      'src/types/fud.d.ts': 'declare   module "*.fud" {\n  export type $Props = any;\n}\n',
    });
    const plan = await planSpec('app-card', options(), fs, reader(PROPS));
    expect(created(plan)).toEqual(['create src/components/app-card.fudspec', 'create src/components/app-card.fixture.ts']);
  });

  it('writes it when the only .d.ts files declare something else', async () => {
    const fs = project({ 'src/vite-env.d.ts': '/// <reference types="vite/client" />\n' });
    const plan = await planSpec('app-card', options(), fs, reader(PROPS));
    expect(created(plan)).toContain(`create ${ENV_FILE}`);
  });
});

describe('g spec of a component that does not exist (criterion 10)', () => {
  it('creates a component that does not exist, exactly as g component --spec writes it', async () => {
    const asked = reader(PROPS);
    const plan = await planSpec('nope', options(), project(), asked);
    const same = await planComponent('nope', { ...options(), dir: COMPONENTS_DIR, wireInto: [], style: true, slot: false, spec: true }, project());
    expect(plan).toEqual(same);
    expect(created(plan)).toEqual(['create src/components/app-nope.fud', 'create src/components/app-nope.fudspec']);
    expect(plan.changes[1]?.contents).toBe(specSkeleton('app-nope', false));
    // A new component has no props to read, and so no fixture.
    expect(asked.calls).toEqual([]);
  });

  it('treats a page with the name as no component: it creates one', async () => {
    const plan = await planSpec('index', options(), project(), reader(PROPS));
    expect(plan.errors).toEqual([]);
    expect(created(plan)).toEqual(['create src/components/app-index.fud', 'create src/components/app-index.fudspec']);
  });

  it('keeps --force on the way to g component', async () => {
    const taken = project({ 'src/components/app-nope.fudspec': 'component app-nope\n' });
    expect((await planSpec('nope', options(), taken, reader(PROPS))).errors.map((e) => e.code)).toEqual(['FUD0443']);
    expect(created(await planSpec('nope', options({ force: true }), taken, reader(PROPS)))).toEqual([
      'create src/components/app-nope.fud',
      'modify src/components/app-nope.fudspec',
    ]);
  });

  it('the project errors of every generator: no project, an unknown --project', async () => {
    const outside = await planSpec('card', options(), new MemoryFs({}, CWD), reader(PROPS));
    expect(outside.errors.map((error) => error.code)).toEqual(['FUD0781']);
    const unknown = await planSpec('card', options({ project: 'nope' }), project(), reader(PROPS));
    expect(unknown.errors.map((error) => error.code)).toEqual(['FUD0782']);
  });
});

describe('g component --spec (criterion 12)', () => {
  const component = (over: Partial<ComponentOptions> = {}): ComponentOptions => ({
    cwd: CWD,
    force: false,
    dir: 'src/components',
    wireInto: [],
    style: true,
    slot: false,
    spec: true,
    ...over,
  });

  it('parses --spec', () => {
    expect(parseArgs(['g', 'c', 'card', '--spec'])).toMatchObject({ kind: 'component', opts: { spec: true } });
    expect(parseArgs(['g', 'c', 'card'])).toMatchObject({ kind: 'component', opts: { spec: false } });
  });

  it('writes the .fud and its .fudspec, without a fixture', async () => {
    const plan = await planComponent('card', component(), projectFs({}, CWD, CONFIG));
    expect(plan.errors).toEqual([]);
    expect(created(plan)).toEqual(['create src/components/app-card.fud', 'create src/components/app-card.fudspec']);
    expect(plan.changes[1]?.contents).toBe(specSkeleton('app-card', false));
  });

  it('refuses an existing .fudspec with FUD0443, and replaces it with --force', async () => {
    const fs = projectFs({ 'src/components/app-card.fudspec': 'component app-card\n' }, CWD, CONFIG);
    expect((await planComponent('card', component(), fs)).errors.map((error) => error.code)).toEqual(['FUD0443']);
    const forced = await planComponent('card', component({ force: true }), fs);
    expect(created(forced)).toEqual(['create src/components/app-card.fud', 'modify src/components/app-card.fudspec']);
  });
});

describe('g spec through the binary, over a real project (criteria 7 and 10)', () => {
  const TSCONFIG = JSON.stringify({
    compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
    include: ['src/**/*.ts', 'src/**/*.fud'],
  });

  function disk(): string {
    const root = mkdtempSync(join(tmpdir(), 'fudic-gspec-')).replace(/\\/gu, '/');
    const files: Record<string, string> = {
      'fudic.json': JSON.stringify(CONFIG),
      'tsconfig.json': TSCONFIG,
      'src/components/app-card.fud': component('app-card', CARD_TYPE),
    };
    for (const [relative, text] of Object.entries(files)) {
      const file = join(root, relative);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
    }
    return root;
  }

  it('--dry-run --json shows the three files, read with TypeScript, and writes nothing', async () => {
    const root = disk();
    const capture = captureStreams();
    const untouched = new MemoryFs({}, root);
    const deps = { readIo: nodeReadIo(), writeIo: untouched, runner: new RecordingRunner(), streams: capture.streams };

    expect(await run(['g', 'spec', 'card', '--cwd', root, '--dry-run', '--json'], deps)).toBe(0);
    const plan = JSON.parse(capture.stdout()) as { changes: { path: string; contents: string }[] };
    expect(plan.changes.map((change) => change.path)).toEqual([
      'src/components/app-card.fudspec',
      'src/components/app-card.fixture.ts',
      'src/fudic-env.d.ts',
    ]);
    expect(plan.changes[1]?.contents).toBe(FIXTURE);
    expect(untouched.paths()).toEqual([]);
  });

  it('writes them, and writes the component and its .fudspec when it is not there', async () => {
    const root = disk();
    const capture = captureStreams();
    const deps = { readIo: nodeReadIo(), writeIo: nodeWriteIo(), runner: new RecordingRunner(), streams: capture.streams };

    expect(await run(['g', 'spec', 'app-card', '--cwd', root], deps)).toBe(0);
    expect(readFileSync(join(root, 'src/components/app-card.fixture.ts'), 'utf8')).toBe(FIXTURE);
    expect(readFileSync(join(root, 'src/fudic-env.d.ts'), 'utf8')).toBe(ENV_DECLARATION);

    expect(await run(['g', 'spec', 'nope', '--cwd', root], deps)).toBe(0);
    expect(readFileSync(join(root, 'src/components/app-nope.fud'), 'utf8')).toContain('<app-nope>');
    expect(readFileSync(join(root, 'src/components/app-nope.fudspec'), 'utf8')).toBe(specSkeleton('app-nope', false));
  });
});
