/**
 * SDD-77 §4.7 and §8.2.25–30 — what `@fudic/language-server/project` says exists in a project:
 * `symbols` of the seven kinds, `describe` of a component, a route, a declaration and a token,
 * the `handlers` a `.fudapi` asks for and the `pieces` whose phases the MCP reads. Over a project
 * of the test's own, and over `examples/workspace/apps/tienda` for what comes from a library.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createProjectChecker, toPosix } from '@fudic/typecheck';
import { exampleOf, routePattern } from '../src/project-symbols.js';
import { openProject, type ProjectService } from '../src/project.js';

// Each project is checked whole before it is asked: slow beside the rest of the suite.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

const TIENDA = toPosix(fileURLToPath(new URL('../../../examples/workspace/apps/tienda', import.meta.url)));

const TSCONFIG = JSON.stringify({
  compilerOptions: { target: 'ES2024', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true },
  include: ['src/**/*.fud'],
});

const BADGE = `@code {
  /**
   * A badge for a count. It sits beside a title.
   */
  const { label, onPick, tone = 'plain' } = props<{
    /** What it says. */
    label: string;
    onPick: (n: number) => void;
    /**  */
    tone?: string;
  }>();
}

<app-badge>
  <template shadowrootmode="open">
    <span>@label</span>
    <slot></slot>
    <slot name="icon"></slot>
  </template>
</app-badge>
`;

const PLAIN = '<app-plain>\n  <template shadowrootmode="open"><b>x</b></template>\n</app-plain>\n';

const INDEX = '<!DOCTYPE html>\n<html>\n<head><title>t</title><link rel="component" href="../components/app-badge.fud"></head>\n<body>\n  <app-badge label="x"></app-badge>\n</body>\n</html>\n';

const PRODUCT = '<link rel="server" href="./[id].fudapi">\n<link rel="server">\n<link rel="server" href="./gone.fudapi">\n\n<h1>Product</h1>\n';

const PRODUCT_API = `# The product, read on the server. It is shown whole.
load
  name  str

# Saves it,
# over two lines. And more.
put save
  name  str

paths
  id  str

layout
  title  str

# A product.
type Product
  id  i32

type Product
  id  i32

enum Kind
  a
  b

form personForm
  name  str = ""

chain
  use auth
`;

const EXTENSIONS = `# Who is calling
middleware auth
  client
  server

rule nif
  on field str
  runs server
  fails taken

rule short
  on field str
  fails long
`;

const PIPE = '# Loud.\npipe shout\n  on str\n';

const CSS = ':root {\n  /** The brand colour. Used for links. */\n  --app-color-primary: #0b5fff;\n  --app-gap: 1rem;\n}\n';

let roots: string[] = [];

function project(files: Readonly<Record<string, string>>): string {
  const root = toPosix(mkdtempSync(join(tmpdir(), 'fudic-ls-symbols-')));
  roots.push(root);
  for (const [relative, text] of Object.entries({ 'tsconfig.json': TSCONFIG, ...files })) {
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    writeFileSync(join(root, relative), text);
  }
  return root;
}

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe('routePattern', () => {
  it('the URL of a route file; nothing for what is not a page', () => {
    const root = '/p';
    expect(routePattern(root, '/p/src/routes/index.fud')).toBe('/');
    expect(routePattern(root, '/p/src/routes/about/index.fud')).toBe('/about');
    expect(routePattern(root, '/p/src/routes/products/[id].fud')).toBe('/products/:id');
    expect(routePattern(root, '/p/src/routes/_layout.fud')).toBeUndefined();
    expect(routePattern(root, '/p/src/routes/admin/_error.fud')).toBeUndefined();
    expect(routePattern(root, '/p/src/routes/notes.md')).toBeUndefined();
    expect(routePattern(root, '/p/src/components/a.fud')).toBeUndefined();
  });
});

describe('exampleOf', () => {
  const contract = (over: object) => ({ props: [], slots: [], defaultSlot: false, ...over }) as never;
  it('an empty use without props or slots; a text and an element per slot with them', () => {
    expect(exampleOf('app-x', contract({}), new Map())).toEqual({ text: '<app-x></app-x>', fill: [] });
    expect(exampleOf('app-x', contract({ defaultSlot: true, slots: ['icon'] }), new Map()).text).toBe(
      '<app-x>\n  Text\n  <span slot="icon">icon</span>\n</app-x>',
    );
  });
});

describe('over a project of its own', () => {
  let root: string;
  let service: ProjectService;

  beforeAll(() => {
    root = project({
      'fudic.json': JSON.stringify({ id: 'demo', kind: 'app', prefix: 'app', globalStyles: { app: 'src/app.css' } }),
      'src/app.css': CSS,
      'src/components/app-badge.fud': BADGE,
      'src/components/app-plain.fud': PLAIN,
      'src/routes/index.fud': INDEX,
      'src/routes/about/index.fud': '<h1>About</h1>\n',
      'src/routes/_layout.fud': '<slot></slot>\n',
      'src/routes/products/[id].fud': PRODUCT,
      'src/routes/products/[id].fudapi': PRODUCT_API,
      'src/middlewares/auth.fudapi': EXTENSIONS,
      'src/pipes/shout.fudapi': PIPE,
      'src/server/routes/products/[id].ts': "import { load } from 'fudic:routes/products/[id]';\nload.handle(() => ({ name: 'x' }));\n",
      'src/browser/auth.ts': "import { auth } from 'fudic:middlewares/auth';\nauth.client((ctx, next) => next(ctx));\n",
      'src/server/auth.ts': "import { auth } from 'fudic:middlewares/auth';\nauth.server((ctx, next) => next(ctx));\n",
    });
    const checker = createProjectChecker({ root });
    checker.check();
    service = openProject(root, { typescript: () => checker.languageService() });
  });

  it('routes: the pages, by their URL, without the router\'s files', () => {
    expect(service.symbols('routes').map((s) => [s.name, s.from])).toEqual([
      ['/', null],
      ['/about', null],
      ['/products/:id', null],
    ]);
  });

  it('components: the first sentence of their doc, none without one', () => {
    expect(service.symbols('components').map(({ name, doc, from }) => ({ name, doc, from }))).toEqual([
      { name: 'app-badge', doc: 'A badge for a count.', from: null },
      { name: 'app-plain', doc: undefined, from: null },
    ]);
  });

  it('types, by their name; a doc of one sentence over two lines is unwrapped', () => {
    expect(service.symbols('types').map((s) => [s.name, s.doc])).toEqual([
      ['Kind', undefined],
      ['Product', 'A product.'],
      ['Product', undefined],
      ['personForm', undefined],
    ]);
  });

  it('functions: load, paths and layout by their kind, the rest by name; connected or missing', () => {
    expect(service.symbols('functions').map((s) => [s.name, s.state, s.doc])).toEqual([
      ['middlewares/auth.nif', 'missing', undefined],
      ['middlewares/auth.short', 'missing', undefined],
      ['routes/products/[id].layout', 'missing', undefined],
      ['routes/products/[id].load', 'connected', 'The product, read on the server.'],
      ['routes/products/[id].paths', 'missing', undefined],
      ['routes/products/[id].save', 'missing', 'Saves it, over two lines.'],
    ]);
  });

  it('middlewares and pipes: a doc without a full stop is whole', () => {
    expect(service.symbols('middlewares').map((s) => [s.name, s.state, s.doc])).toEqual([['auth', 'connected', 'Who is calling']]);
    expect(service.symbols('pipes').map((s) => [s.name, s.state, s.doc])).toEqual([['shout', 'missing', 'Loud.']]);
  });

  it('tokens: in the order they are adopted, with their group and the first sentence of their doc', () => {
    expect(service.symbols('tokens').map(({ name, value, group, doc, from }) => ({ name, value, group, doc, from }))).toEqual([
      { name: '--app-color-primary', value: '#0b5fff', group: 'color', doc: 'The brand colour.', from: null },
      { name: '--app-gap', value: '1rem', group: undefined, doc: undefined, from: null },
    ]);
  });

  it('every kind at once, in the order of the kinds; names is every name', () => {
    const kinds = service.symbols().map((s) => s.kind);
    expect([...new Set(kinds)]).toEqual(['routes', 'components', 'types', 'functions', 'middlewares', 'pipes', 'tokens']);
    expect(service.names()).toEqual(service.symbols().map((s) => s.name));
  });

  it('describe a component: its contract, its link, where it is used and an example', () => {
    const description = service.describe('app-badge');
    expect(description).toMatchObject({
      kind: 'component',
      name: 'app-badge',
      from: null,
      link: '<link rel="component" href="../components/app-badge.fud">',
      example: { text: "<app-badge .label=@('')>\n  Text\n  <span slot=\"icon\">icon</span>\n</app-badge>", fill: ['onPick'] },
    });
    expect(description?.kind === 'component' && description.usedIn.map((u) => u.file)).toEqual([`${root}/src/routes/index.fud`]);
  });

  it('describe a component without TypeScript: no prop has a sample, every required one is to fill', () => {
    const bare = openProject(root);
    expect(bare.describe('app-badge')).toMatchObject({ example: { fill: ['label', 'onPick'] } });
    expect(openProject(root, { typescript: () => undefined }).describe('app-plain')).toMatchObject({ example: { text: '<app-plain></app-plain>' } });
  });

  it('describe a route: its .fudapi and what it declares about the page; a route without one', () => {
    expect(service.describe('/products/:id')).toEqual({
      kind: 'route',
      name: '/products/:id',
      file: `${root}/src/routes/products/[id].fud`,
      api: `${root}/src/routes/products/[id].fudapi`,
      declares: ['load', 'paths', 'layout'],
    });
    expect(service.describe('/about')).toEqual({ kind: 'route', name: '/about', file: `${root}/src/routes/about/index.fud`, declares: [] });
  });

  it('describe a declaration: its lines, its doc, and who implements it', () => {
    expect(service.describe('routes/products/[id].load')).toMatchObject({
      kind: 'function',
      from: null,
      doc: 'The product, read on the server. It is shown whole.',
      source: 'load\n  name  str',
      state: 'connected',
      implementedIn: [{ file: `${root}/src/server/routes/products/[id].ts` }],
    });
    expect(service.describe('Kind')).toMatchObject({ kind: 'type', source: 'enum Kind\n  a\n  b' });
    expect(service.describe('Kind')).not.toHaveProperty('state');
    expect(service.describe('Kind')).not.toHaveProperty('doc');
    expect(service.describe('auth')).toMatchObject({ kind: 'middleware', state: 'connected' });
    expect(service.describe('shout')).toMatchObject({ kind: 'pipe', state: 'missing', implementedIn: [] });
  });

  it('describe a token: its value, its style, its group and its whole doc; nothing for an unknown name', () => {
    expect(service.describe('--app-color-primary')).toMatchObject({
      kind: 'token',
      from: null,
      value: '#0b5fff',
      group: 'color',
      doc: 'The brand colour. Used for links.',
      style: { name: 'app', global: true },
    });
    expect(service.describe('--app-gap')).not.toHaveProperty('group');
    expect(service.describe('--app-gap')).not.toHaveProperty('doc');
    expect(service.describe('app-nope')).toBeUndefined();
  });

  it('handlers: what a .fudapi asks for, with its methods, where a rule runs, and its state', () => {
    expect(service.handlers('routes/products/[id]')?.map((h) => [h.name, h.exported, h.methods, h.state])).toEqual([
      ['routes/products/[id].load', 'load', ['handle'], 'connected'],
      ['routes/products/[id].save', 'save', ['handle'], 'missing'],
      ['routes/products/[id].paths', 'paths', ['handle'], 'missing'],
      ['routes/products/[id].layout', 'layout', ['handle'], 'missing'],
    ]);
    const rules = service.handlers('middlewares/auth')!;
    expect(rules.map((h) => [h.exported, h.methods, h.runs])).toEqual([
      ['auth', ['client', 'server'], undefined],
      ['nif', ['check'], 'server'],
      ['short', ['check'], undefined],
    ]);
    expect(service.handlers('routes/nope')).toBeUndefined();
  });

  it('pieces: the components and routes of the project, with their servers, sibling and docs', () => {
    expect(service.pieces().map(({ kind, name, servers, sibling, documented }) => ({ kind, name, servers, sibling, documented }))).toEqual([
      { kind: 'component', name: 'app-badge', servers: [], sibling: undefined, documented: { doc: true, props: 3, documented: 1 } },
      { kind: 'component', name: 'app-plain', servers: [], sibling: undefined, documented: { doc: false, props: 0, documented: 0 } },
      { kind: 'route', name: '/about', servers: [], sibling: undefined, documented: { doc: false, props: 0, documented: 0 } },
      { kind: 'route', name: '/', servers: [], sibling: undefined, documented: { doc: false, props: 0, documented: 0 } },
      { kind: 'route', name: '/products/:id', servers: ['routes/products/[id]'], sibling: 'routes/products/[id]', documented: { doc: false, props: 0, documented: 0 } },
    ]);
  });

  it('a script that changed is read again', () => {
    const fresh = openProject(root);
    expect(fresh.symbols('pipes')[0]?.state).toBe('missing');
    const file = `${root}/src/pipes/shout.ts`;
    writeFileSync(file, "import { shout } from 'fudic:pipes/shout';\nexport default shout.implement((v) => v);\n");
    fresh.invalidate(file);
    expect(fresh.symbols('pipes')[0]?.state).toBe('connected');
    rmSync(file);
    fresh.invalidate(file);
  });
});

describe('a project without fudic.json: the default folders of its handlers', () => {
  it('a handler in src/server is found', () => {
    const root = project({
      'src/routes/shop.fud': '<link rel="server" href="./shop.fudapi">\n<h1>Shop</h1>\n',
      'src/routes/shop.fudapi': 'get count\n  -> i32\n',
      'src/server/shop.ts': "import { count } from 'fudic:routes/shop';\ncount.handle(() => 3);\n",
    });
    expect(openProject(root).symbols('functions').map((s) => [s.name, s.state])).toEqual([['routes/shop.count', 'connected']]);
    expect(openProject(root).symbols('tokens')).toEqual([]);
  });
});

describe('over examples/workspace/apps/tienda', () => {
  let service: ProjectService;
  beforeAll(() => {
    service = openProject(TIENDA);
  });

  it('routes are the app\'s own: a library\'s files are no page', () => {
    expect(service.symbols('routes').map((s) => s.name)).toEqual(['/', '/catalogo']);
  });

  it('a component of a library comes from its package', () => {
    expect(service.symbols('components').find((s) => s.name === 'ui-card')).toMatchObject({ from: '@fudic/example-ui' });
    expect(service.describe('ui-card')).toMatchObject({ kind: 'component', from: '@fudic/example-ui' });
  });

  it('a pipe of a library: its package, and no state, since its handler is the library\'s', () => {
    const pipe = service.symbols('pipes').find((s) => s.name === 'iniciales');
    expect(pipe).toMatchObject({ from: '@fudic/example-ui' });
    expect(pipe).not.toHaveProperty('state');
    expect(service.describe('iniciales')).toMatchObject({ kind: 'pipe', from: '@fudic/example-ui' });
    expect(service.describe('iniciales')).not.toHaveProperty('state');
    expect(service.handlers('@fudic/example-ui/pipes/iniciales')?.map((h) => h.state)).toEqual(['missing']);
  });

  it('the tokens of the guide come from its package, the app\'s own from none; a library\'s pieces are not the project\'s', () => {
    const tokens = service.symbols('tokens');
    // The guide declares them; the app may declare some again, over them, as its own.
    expect(tokens.find((t) => t.name === '--guia-ink' && t.from === '@fudic/example-guia')).toBeDefined();
    expect(tokens.some((t) => t.from === null)).toBe(true);
    expect(service.describe('--guia-ink')).toMatchObject({ from: '@fudic/example-guia' });
    expect(service.pieces().every((p) => !p.file.includes('node_modules'))).toBe(true);
  });
});

describe('a project with a library that has no name, and a package it does not depend on', () => {
  let root: string;
  let service: ProjectService;
  const LIB = '<lib-x>\n  <template shadowrootmode="open"><i>x</i></template>\n</lib-x>\n';

  beforeAll(() => {
    root = project({
      'package.json': JSON.stringify({ name: 'demo', dependencies: { nameless: '1.0.0' } }),
      'fudic.json': JSON.stringify({ id: 'demo', kind: 'app', prefix: 'app' }),
      'node_modules/nameless/package.json': JSON.stringify({ name: '', version: '1.0.0' }),
      'node_modules/nameless/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'lib' }),
      'node_modules/nameless/src/components/lib-x.fud': LIB,
      'src/vendor/package.json': JSON.stringify({ name: 'vendored' }),
      'src/vendor/app-vend.fud': PLAIN.replaceAll('app-plain', 'app-vend'),
      'src/routes/index.fud': '<h1>Home</h1>\n',
      'src/routes/gone.fud': '<h1>Gone</h1>\n',
    });
    const checker = createProjectChecker({ root });
    checker.check();
    service = openProject(root, { typescript: () => checker.languageService() });
  });

  it('a library without a name is no package: its component comes from none', () => {
    const lib = service.symbols('components').find((s) => s.name === 'lib-x');
    expect(lib?.from).toBeNull();
  });

  it('a component outside the program has no prop shapes: its example is the bare tag', () => {
    expect(service.describe('lib-x')).toMatchObject({ example: { text: '<lib-x></lib-x>', fill: [] } });
  });

  it('a component no route of the project can name by a package: linked by its path', () => {
    expect(service.describe('app-vend')).toMatchObject({ link: `<link rel="component" href="${root}/src/vendor/app-vend.fud">` });
  });

  it('a page removed since the index read it: still a piece, with nothing linked', () => {
    expect(service.pieces().map((p) => p.name)).toContain('/gone');
    rmSync(join(root, 'src/routes/gone.fud'));
    expect(service.pieces().find((p) => p.name === '/gone')).toMatchObject({ servers: [] });
  });
});

describe('a component written after the check', () => {
  it('is not in the program the check holds: no prop shapes, every required prop to fill', () => {
    const root = project({ 'src/routes/index.fud': '<h1>Home</h1>\n' });
    const checker = createProjectChecker({ root });
    checker.check();
    mkdirSync(join(root, 'src/components'), { recursive: true });
    writeFileSync(
      join(root, 'src/components/app-late.fud'),
      "@code {\n  const { label } = props<{ label: string }>();\n}\n\n<app-late>\n  <template shadowrootmode=\"open\"><b>@label</b></template>\n</app-late>\n",
    );
    const service = openProject(root, { typescript: () => checker.languageService() });
    expect(service.describe('app-late')).toMatchObject({ example: { fill: ['label'] } });
  });
});
