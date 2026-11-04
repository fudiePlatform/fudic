/**
 * `fudic g api <piece>` (SDD-66 §3.1, §4.1) — criteria 1–5.
 *
 * Driven through `run()`, the way a user and the MCP reach it, over a `MemoryFs` project. One
 * project written to disk takes criterion 1 end to end: what the command wrote compiles and its
 * `hello` answers from the in-memory server of `@fudic/testing`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiIndex, emitDeclarations, parseApi, type ApiSource } from '@fudic/api';
import { beforeAll, describe, expect, it } from 'vitest';
import { nodeReadIo, nodeWriteIo } from '../src/io.js';
import { parseFud } from '../src/parse.js';
import { run } from '../src/run.js';
import { captureStreams, MemoryFs, projectFs, RecordingRunner } from './helpers.js';

const CWD = '/project';

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

const LAYOUT = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    @RenderHead()
  </head>
  <body>
    <main>@RenderBody()</main>
  </body>
</html>
`;

/** A route as `fudic g page about` writes it: no server, its title spelled out. */
const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">

<head>
  <title>About</title>
</head>

<h1>About</h1>
`;

/** A page with no layout: its links go inside `<head>`. */
const PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Solo</title>
  </head>
  <body>
    <h1>Solo</h1>
  </body>
</html>
`;

/** A component as `fudic g component cart` writes it in a project with prefix `acme`. */
const CART = `<head>
  <style></style>
</head>

<acme-cart>
  <template shadowrootmode="open">
  </template>
</acme-cart>
`;

/** A component that already links another one: the server link goes with its links. */
const LIST = `<link rel="component" href="../acme-cart/acme-cart.fud">

<acme-list>
  <template shadowrootmode="open">
    <acme-cart></acme-cart>
  </template>
</acme-list>
`;

const PACKAGE = '{ "name": "demo", "dependencies": {} }\n';

const SNIPPETS = `@snippet badge() {
  <div class="badge"></div>
}
`;

/**
 * The `<id>` of a component's `.fudapi`: its path inside `src/`, without the extension
 * (SDD-60 §3.11). A component lives in its folder, so the id names the folder and the file.
 */
const CART_ID = 'components/acme-cart/acme-cart';

function project(): MemoryFs {
  return projectFs(
    {
      // What `g api` adds `@fudic/http` to: the server root it generates imports it.
      'package.json': PACKAGE,
      'src/layouts/_layout.fud': LAYOUT,
      'src/routes/about.fud': ROUTE,
      'src/routes/solo.fud': PAGE,
      'src/components/acme-cart/acme-cart.fud': CART,
      'src/components/acme-list/acme-list.fud': LIST,
      'src/snippets/ui.fud': SNIPPETS,
      'src/styles/site.css': 'body { margin: 0; }\n',
    },
    CWD,
    { id: 'demo', kind: 'app', prefix: 'acme' },
  );
}

function componentApi(id: string): string {
  return `# The server functions of the component: their handlers are in src/server/${id}.ts.\nget hello\n  -> str\n`;
}

function componentHandler(id: string): string {
  return `import { hello } from 'fudic:${id}';\n\nhello.handle(() => 'Hello from the server');\n`;
}

const errorsOf = (fud: string): unknown[] => parseFud(fud).diagnostics.filter((d) => d.severity === 'error');

describe('criterion 1: g api on a component (the plan)', () => {
  it('writes the .fudapi beside it, its handler in src/server and the link at the very top', async () => {
    const fs = project();
    const { code, out } = await cli(fs, 'g', 'api', 'src/components/acme-cart', '--cwd', CWD);
    expect(out).not.toMatch(/FUD\d{4}/u);
    expect(code).toBe(0);

    expect(fs.at('src/components/acme-cart/acme-cart.fudapi')).toBe(componentApi(CART_ID));
    expect(fs.at(`src/server/${CART_ID}.ts`)).toBe(componentHandler(CART_ID));
    // A component with no links: the server link is its first line, and nothing else moves.
    expect(fs.at('src/components/acme-cart/acme-cart.fud')).toBe(`<link rel="server" href="./acme-cart.fudapi">\n${CART}`);
    expect(errorsOf(fs.at('src/components/acme-cart/acme-cart.fud'))).toEqual([]);
    // The server root a `.fudapi` gives the app imports `@fudic/http`: the app now depends on it.
    const pkg = JSON.parse(fs.at('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies)).toContain('@fudic/http');
  });

  it('does not add @fudic/http to an app that already depends on it', async () => {
    const fs = project();
    const declared = '{ "name": "demo", "dependencies": { "@fudic/http": "0.0.1" } }\n';
    fs.write(`${CWD}/package.json`, declared);
    const { code } = await cli(fs, 'g', 'api', 'src/components/acme-cart', '--cwd', CWD);
    expect(code).toBe(0);
    expect(fs.at('package.json')).toBe(declared);
  });

  it('takes the .fud as well as its folder, and both write the same files', async () => {
    const byFolder = project();
    const byFile = project();
    await cli(byFolder, 'g', 'api', 'src/components/acme-cart', '--cwd', CWD);
    const { code } = await cli(byFile, 'g', 'api', 'src/components/acme-cart/acme-cart.fud', '--cwd', CWD);
    expect(code).toBe(0);
    expect(byFile.paths()).toEqual(byFolder.paths());
    for (const path of byFolder.paths()) expect(byFile.at(path)).toBe(byFolder.at(path));
  });

  it('puts the server link with the component links it already has', async () => {
    const fs = project();
    const { code } = await cli(fs, 'g', 'api', 'src/components/acme-list', '--cwd', CWD);
    expect(code).toBe(0);
    expect(fs.at('src/components/acme-list/acme-list.fud')).toBe(
      LIST.replace(
        '<link rel="component" href="../acme-cart/acme-cart.fud">',
        '<link rel="component" href="../acme-cart/acme-cart.fud">\n<link rel="server" href="./acme-list.fudapi">',
      ),
    );
    expect(fs.at(`src/server/components/acme-list/acme-list.ts`)).toBe(componentHandler('components/acme-list/acme-list'));
  });

  it('reads the server folder from fudic.json', async () => {
    const fs = projectFs(
      { 'package.json': PACKAGE, 'src/components/acme-cart/acme-cart.fud': CART },
      CWD,
      { id: 'demo', kind: 'app', prefix: 'acme', server: 'backend' },
    );
    const { code } = await cli(fs, 'g', 'api', 'src/components/acme-cart', '--cwd', CWD);
    expect(code).toBe(0);
    expect(fs.at(`backend/${CART_ID}.ts`)).toBe(componentHandler(CART_ID));
    expect(fs.at('src/components/acme-cart/acme-cart.fudapi')).toContain(`their handlers are in backend/${CART_ID}.ts.`);
    expect(fs.exists(`${CWD}/src/server/${CART_ID}.ts`)).toBe(false);
  });
});

describe('criterion 2: g api on a route', () => {
  it('writes its load, its handler and the link after the layout link; the title does not change', async () => {
    const fs = project();
    const { code } = await cli(fs, 'g', 'api', 'src/routes/about.fud', '--cwd', CWD);
    expect(code).toBe(0);

    // What `g page about --server` writes beside the route.
    expect(fs.at('src/routes/about.fudapi')).toBe(
      '# The data of the page, read on the server: its handler is in src/server/routes/about.ts.\nload\n  title  str\n',
    );
    expect(fs.at('src/server/routes/about.ts')).toBe(
      "import { load } from 'fudic:routes/about';\n\nload.handle(() => ({ title: 'Untitled' }));\n",
    );
    // Only the link is added: `About` is still the title, not `@data.title`.
    expect(fs.at('src/routes/about.fud')).toBe(
      ROUTE.replace(
        '<link rel="layout" href="../layouts/_layout.fud">',
        '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./about.fudapi">',
      ),
    );
    expect(errorsOf(fs.at('src/routes/about.fud'))).toEqual([]);
  });

  it('on a page with no layout, the link goes inside <head>', async () => {
    const fs = project();
    const { code } = await cli(fs, 'g', 'api', 'src/routes/solo.fud', '--cwd', CWD);
    expect(code).toBe(0);
    expect(fs.at('src/routes/solo.fud')).toBe(PAGE.replace('  <head>\n', '  <head>\n    <link rel="server" href="./solo.fudapi">\n'));
    expect(fs.at('src/routes/solo.fudapi')).toContain('load\n  title  str\n');
    expect(fs.at('src/server/routes/solo.ts')).toContain("from 'fudic:routes/solo'");
  });
});

describe('criterion 3: a second time', () => {
  it('is FUD0443 and writes nothing; with --force it writes again, without a second link', async () => {
    const fs = project();
    expect((await cli(fs, 'g', 'api', 'src/components/acme-cart', '--cwd', CWD)).code).toBe(0);
    const fud = fs.at('src/components/acme-cart/acme-cart.fud');

    // Someone edited the handler: a second run must not lose it.
    fs.write(`${CWD}/src/server/${CART_ID}.ts`, '// mine\n');
    const again = await cli(fs, 'g', 'api', 'src/components/acme-cart', '--cwd', CWD);
    expect(again.code).toBe(1);
    expect(again.out).toContain('FUD0443');
    expect(fs.at(`src/server/${CART_ID}.ts`)).toBe('// mine\n');
    expect(fs.at('src/components/acme-cart/acme-cart.fud')).toBe(fud);

    const forced = await cli(fs, 'g', 'api', 'src/components/acme-cart', '--force', '--cwd', CWD);
    expect(forced.code).toBe(0);
    expect(fs.at(`src/server/${CART_ID}.ts`)).toBe(componentHandler(CART_ID));
    expect(fs.at('src/components/acme-cart/acme-cart.fudapi')).toBe(componentApi(CART_ID));
    expect(fs.at('src/components/acme-cart/acme-cart.fud')).toBe(fud);
    expect(fud.match(/rel="server"/gu)).toHaveLength(1);
  });

  it('a .fudapi already there, without a handler, is FUD0443 too', async () => {
    const fs = project();
    fs.write(`${CWD}/src/routes/about.fudapi`, 'load\n  title  str\n');
    const { code, out } = await cli(fs, 'g', 'api', 'src/routes/about.fud', '--cwd', CWD);
    expect(code).toBe(1);
    expect(out).toContain('FUD0443');
    expect(fs.exists(`${CWD}/src/server/routes/about.ts`)).toBe(false);
    expect(fs.at('src/routes/about.fud')).toBe(ROUTE);
  });
});

describe('criterion 4: what has no server of its own', () => {
  it.each([
    ['a layout', 'src/layouts/_layout.fud'],
    ['a file of snippets', 'src/snippets/ui.fud'],
    ['something that is not a .fud', 'src/styles/site.css'],
  ])('%s is FUD1240, and nothing is written', async (_, piece) => {
    const fs = project();
    const before = fs.paths();
    const { code, out } = await cli(fs, 'g', 'api', piece, '--cwd', CWD);
    expect(code).toBe(1);
    expect(out).toContain('FUD1240');
    expect(fs.paths()).toEqual(before);
  });

  it('a folder without its .fud, or a .fud that does not exist, is FUD1240', async () => {
    const fs = project();
    fs.write(`${CWD}/src/components/acme-empty/notes.md`, 'nothing here\n');
    const before = fs.paths();
    for (const piece of ['src/components/acme-empty', 'src/routes/nope.fud']) {
      const { code, out } = await cli(fs, 'g', 'api', piece, '--cwd', CWD);
      expect(code, piece).toBe(1);
      expect(out, piece).toContain('FUD1240');
    }
    expect(fs.paths()).toEqual(before);
  });

  it('a --project that does not exist is refused before the piece is looked at', async () => {
    const fs = new MemoryFs({}, '/w');
    expect((await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', '/w')).code).toBe(0);
    const before = fs.paths();
    const { code, out } = await cli(fs, 'g', 'api', 'src/components/x', '--project', 'nope', '--cwd', '/w/shop');
    expect(code).toBe(1);
    expect(out).toMatch(/FUD\d{4}/u);
    expect(out).not.toContain('FUD1240');
    expect(fs.paths()).toEqual(before);
  });

  it("a library's component is FUD1241, and nothing is written", async () => {
    const fs = new MemoryFs({}, '/w');
    expect((await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', '/w')).code).toBe(0);
    expect((await cli(fs, 'g', 'lib', 'ui', '--cwd', '/w/shop')).code).toBe(0);
    expect((await cli(fs, 'g', 'component', 'button', '--project', 'ui', '--cwd', '/w/shop')).code).toBe(0);
    const before = fs.paths();

    const { code, out } = await cli(fs, 'g', 'api', 'src/components/ui-button', '--project', 'ui', '--cwd', '/w/shop');
    expect(code).toBe(1);
    expect(out).toContain('FUD1241');
    expect(fs.paths()).toEqual(before);
  });

  it("--project reaches an app's component from the workspace root", async () => {
    const fs = new MemoryFs({}, '/w');
    expect((await cli(fs, 'new', 'shop', '--workspace', '--app', 'web', '--cwd', '/w')).code).toBe(0);
    expect((await cli(fs, 'g', 'component', 'cart', '--project', 'web', '--cwd', '/w/shop')).code).toBe(0);
    const fud = fs.paths().find((path) => /^shop\/apps\/web\/src\/components\/[^/]+\/[^/]+\.fud$/u.test(path))!;
    const folder = fud.slice('shop/apps/web/'.length, fud.lastIndexOf('/'));
    const tag = folder.slice(folder.lastIndexOf('/') + 1);

    const { code } = await cli(fs, 'g', 'api', folder, '--project', 'web', '--cwd', '/w/shop');
    expect(code).toBe(0);
    expect(fs.at(`shop/apps/web/${folder}/${tag}.fudapi`)).toContain('get hello');
    expect(fs.at(`shop/apps/web/src/server/components/${tag}/${tag}.ts`)).toContain('hello.handle(');
    expect(fs.at(fud).startsWith(`<link rel="server" href="./${tag}.fudapi">\n`)).toBe(true);
  });
});

describe('criterion 5: --dry-run --json', () => {
  it('prints the plan as JSON and writes nothing', async () => {
    const fs = project();
    const before = new Map(fs.paths().map((path) => [path, fs.at(path)]));
    const { code, out } = await cli(fs, 'g', 'api', 'src/components/acme-cart', '--dry-run', '--json', '--cwd', CWD);
    expect(code).toBe(0);

    const plan = JSON.parse(out) as { changes: { path: string; kind: string }[] };
    expect(plan.changes.map((change) => change.path).sort()).toEqual(
      ['package.json', 'src/components/acme-cart/acme-cart.fud', 'src/components/acme-cart/acme-cart.fudapi', `src/server/${CART_ID}.ts`].sort(),
    );
    expect(plan.changes.find((change) => change.path.endsWith('.fud'))!.kind).toBe('modify');

    expect(fs.paths()).toEqual([...before.keys()]);
    for (const [path, contents] of before) expect(fs.at(path)).toBe(contents);
  });

  it('--dry-run alone lists the same files and writes nothing', async () => {
    const fs = project();
    const before = fs.paths();
    const { code, out } = await cli(fs, 'g', 'api', 'src/routes/about.fud', '--dry-run', '--cwd', CWD);
    expect(code).toBe(0);
    expect(out).toContain('src/routes/about.fudapi');
    expect(out).toContain('src/server/routes/about.ts');
    expect(fs.paths()).toEqual(before);
  });
});

// ---------------------------------------------------------------------------------------------
// Criterion 1, end to end: a project on disk, as a user has it after `fudic new`.
// ---------------------------------------------------------------------------------------------

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PACKAGES = ['core', 'dom', 'ssr', 'transport', 'testing', 'vite', 'http', 'terms'];
const TOOLS = ['vitest', 'vite', 'typescript'];
const VITEST = join(REPO, 'node_modules/vitest/vitest.mjs');
const TSC = join(REPO, 'node_modules/typescript/bin/tsc');

async function real(...argv: string[]): Promise<void> {
  const capture = captureStreams();
  const code = await run(argv, { readIo: nodeReadIo(), writeIo: nodeWriteIo(), runner: new RecordingRunner(), streams: capture.streams });
  if (code !== 0) throw new Error(`fudic ${argv.join(' ')} exited ${code}:\n${capture.stdout()}${capture.stderr()}`);
}

/** Link what an install would put in `node_modules`. */
function install(dir: string): void {
  const modules = join(dir, 'node_modules');
  mkdirSync(join(modules, '@fudic'), { recursive: true });
  for (const name of PACKAGES) symlinkSync(join(REPO, 'packages', name), join(modules, '@fudic', name), 'junction');
  for (const name of TOOLS) symlinkSync(join(REPO, 'node_modules', name), join(modules, name), 'junction');
}

/** The `.d.ts` of a `.fudapi`, as `fudic dev` writes it to `.fudic/api`. */
function declarations(dir: string, file: string, id: string): void {
  const source: ApiSource = { id, path: join(dir, file), file: parseApi(readFileSync(join(dir, file), 'utf8')).value, origin: 'app' };
  const out = join(dir, '.fudic/api', `${id}.d.ts`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, emitDeclarations(source, createApiIndex([source]), {}));
}

function exec(file: string, args: readonly string[], cwd: string): { status: number; output: string } {
  try {
    return { status: 0, output: execFileSync(process.execPath, [file, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    const failed = e as { status?: number; stdout?: string; stderr?: string };
    return { status: failed.status ?? 1, output: `${failed.stdout ?? ''}${failed.stderr ?? ''}` };
  }
}

describe('criterion 1: g api on a component, end to end', () => {
  // Outside any `node_modules`: Vite leaves a module under one to Node, and the server root the
  // plugin generates is never on disk.
  const ROOT = mkdtempSync(join(tmpdir(), 'fudic-api-green-'));
  const app = join(ROOT, 'tienda');
  const tag = 'tienda-cart';
  const id = `components/${tag}/${tag}`;

  beforeAll(async () => {
    await real('new', 'tienda', '--prefix', 'tienda', '--no-install', '--no-git', '--cwd', ROOT);
    await real('g', 'component', 'cart', '--cwd', app);
    await real('g', 'api', `src/components/${tag}`, '--cwd', app);
    install(app);
    declarations(app, `src/components/${tag}/${tag}.fudapi`, id);
    // What a user writes to see it answer: the function, called through the in-memory server
    // (`/_fudic/fn/<id>/hello`), as a component calls it.
    writeFileSync(
      join(app, 'src/hello.test.ts'),
      `import { expect, test } from 'vitest';
import { hello } from 'fudic:${id}';

test('hello answers its text', async () => {
  expect(await hello()).toBe('Hello from the server');
});
`,
    );
  }, 120_000);

  it('the component still compiles without a diagnostic', () => {
    const fud = readFileSync(join(app, `src/components/${tag}/${tag}.fud`), 'utf8');
    expect(fud.startsWith(`<link rel="server" href="./${tag}.fudapi">\n`)).toBe(true);
    expect(parseFud(fud).diagnostics).toEqual([]);
  });

  it('its vitest run passes, the generated tests and hello among them', () => {
    const { status, output } = exec(VITEST, ['run', '--reporter=verbose'], app);
    expect(output).toContain('hello answers its text');
    expect(status, output).toBe(0);
  }, 240_000);

  it('strict tsc says nothing', () => {
    const { status, output } = exec(TSC, ['-p', app, '--noEmit'], app);
    expect(output).toBe('');
    expect(status).toBe(0);
  }, 120_000);
});
