/**
 * `fudic_render` from end to end (SDD-78 criteria 2–6): a client of the server, over an app of
 * `fudic new` with a component, its fixture and two routes, painted by the project's own vitest
 * and by the bench's browser. Slow: each render is a run of vitest or a start of the bench.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { VIEW_META_KEY, VIEW_URI } from '../src/apps.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, newApp } from './helpers.js';

const BUTTON = [
  '@code {',
  '  const { label = "Go", disabled = false, hidden = false, onPick } = props<{',
  '    label?: string;',
  '    disabled?: boolean;',
  '    hidden?: boolean;',
  '    onPick?: () => void;',
  '  }>();',
  '}',
  '',
  '<head>',
  '  <style>',
  '    .box { & .gone { display: none; } }',
  '  </style>',
  '</head>',
  '',
  '<app-button>',
  '  <template shadowrootmode="open">',
  '    <span class="box"><button class=@(hidden ? "gone" : "shown") disabled=@disabled @click=@(() => onPick?.())>@label</button></span>',
  '  </template>',
  '</app-button>',
  '',
].join('\n');

const FIXTURE = [
  "import type { $Props } from './app-button.fud';",
  '',
  'export default {',
  "  primary: { label: 'Save' },",
  "  disabled: { label: 'Save', disabled: true },",
  "  hidden: { label: 'Save', hidden: true },",
  "  picking: { label: 'Pick', onPick: () => undefined },",
  '} satisfies Record<string, $Props>;',
  '',
].join('\n');

const FILES: Readonly<Record<string, string>> = {
  'theme.css': 'button { border-radius: 4px; }\n',
  'src/components/app-button/app-button.fud': BUTTON,
  'src/components/app-button/app-button.fixture.ts': FIXTURE,
  'src/routes/productos/[id].fud': '<link rel="layout" href="../../layouts/_layout.fud">\n<link rel="server" href="./[id].fudapi">\n\n<h1>@data.name</h1>\n',
  'src/routes/productos/[id].fudapi': 'load\n  name  str\n\npaths\n',
  'src/routes/sin.fud': '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./sin.fudapi">\n\n<h1>@data.name</h1>\n',
  'src/routes/sin.fudapi': 'load\n  name  str\n',
  // The fixture of /sin (SDD-82 §3.4): its load has no handler yet, and the fixture answers in its place.
  'src/routes/sin.fixture.ts': "import type { Fixtures } from 'fudic:routes/sin';\n\nexport default { data: { nadie: { name: 'Nadie' } } } satisfies Fixtures;\n",
  // Links its contract, and on hydration calls a function whose handler is not written yet.
  'src/components/app-finder/app-finder.fud': [
    '<link rel="server" href="./app-finder.fudapi">',
    '',
    '@code {',
    '  import { effect, signal } from "@fudic/core";',
    '  const found = signal("");',
    '  effect(() => { void find().then((v) => found.set(v), () => found.set("none")); });',
    '}',
    '',
    '<app-finder>',
    '  <template shadowrootmode="open">',
    '    <p>@found()</p>',
    '  </template>',
    '</app-finder>',
    '',
  ].join('\n'),
  'src/components/app-finder/app-finder.fudapi': 'get find\n  -> str\n',
  'src/server/productos.ts': [
    "import { load, paths } from 'fudic:routes/productos/[id]';",
    '',
    'load.handle((ctx) => {',
    "  if (ctx.params.id === 'roto') throw new Error('the database is down');",
    '  return { name: `Producto ${ctx.params.id}` };',
    '});',
    '',
    "paths.handle(() => ['1', '2']);",
    '',
  ].join('\n'),
};

let app: { readonly root: string; dispose(): void };
let client: Client;

beforeAll(async () => {
  app = await newApp();
  for (const [path, text] of Object.entries(FILES)) {
    mkdirSync(dirname(join(app.root, path)), { recursive: true });
    writeFileSync(join(app.root, path), text);
  }
  const config = JSON.parse(readFileSync(join(app.root, 'fudic.json'), 'utf8')) as Record<string, unknown>;
  writeFileSync(join(app.root, 'fudic.json'), JSON.stringify({ ...config, globalStyles: { theme: 'theme.css' } }, null, 2));
  client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio' }));
}, 120_000);

afterAll(async () => {
  await client.close();
  app.dispose();
});

interface Rendered {
  readonly body: Record<string, unknown>;
  readonly isError: boolean;
  readonly preview?: string;
  readonly diagnostics: readonly { code: string; message: string; at?: string }[];
}

async function render(args: Record<string, unknown>): Promise<Rendered> {
  const result = await client.callTool({ name: 'fudic_render', arguments: args }, undefined, { timeout: 280_000 });
  const body = result.structuredContent as Record<string, unknown>;
  const view = (result._meta as Record<string, { kind: string; html: string }> | undefined)?.[VIEW_META_KEY];
  return {
    body,
    isError: result.isError === true,
    ...(view !== undefined ? { preview: view.html } : {}),
    diagnostics: body['diagnostics'] as Rendered['diagnostics'],
  };
}

const SLOW = 300_000;

describe('the tool (criterion 1)', () => {
  it('names the view in its _meta', async () => {
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === 'fudic_render')?._meta).toMatchObject({ ui: { resourceUri: VIEW_URI } });
  });
});

describe('a component (criterion 2)', () => {
  it('a case of its fixture: its outline', async () => {
    const r = await render({ component: 'app-button', fixture: 'disabled' });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({ component: 'app-button', fixture: 'disabled', engine: 'happy-dom', as: 'outline', outline: '- button "Save" [disabled]', calls: [], next: null });
    // The document the chat draws goes beside the answer, never in it.
    expect(JSON.stringify(r.body)).not.toContain('<!doctype');
  }, SLOW);

  it('props on top change what they change; html has the declarative shadow root; select narrows', async () => {
    const r = await render({ component: 'app-button', fixture: 'disabled', props: { label: 'Keep' }, as: 'html' });
    expect(r.body).not.toHaveProperty('outline');
    const html = r.body['html'] as string;
    expect(html).toMatch(/^<app-button[^>]*><template shadowrootmode="open">/u);
    expect(html).toContain('<button class="shown" disabled="">Keep</button>');
    expect(html).not.toMatch(/<script|<!--/u);

    const narrowed = await render({ component: 'app-button', fixture: 'primary', select: 'button', as: 'html' });
    expect(narrowed.body['html']).toBe('<button class="shown">Save</button>');
  }, SLOW);
});

describe('a route (criterion 3)', () => {
  it('painted with its load, inside its layout; calls names the load', async () => {
    const r = await render({ route: '/productos/1' });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({ route: '/productos/1', status: 200, outline: '- main:\n  - heading "Producto 1" [level=1]' });
    expect(r.body['calls']).toEqual([{ fn: 'routes/productos/[id].load', status: 200 }]);
  }, SLOW);

  it('a load without handler: its 404 and FUD1423', async () => {
    const r = await render({ route: '/sin' });
    expect(r.body).toMatchObject({ status: 404, calls: [{ fn: 'routes/sin.load', status: 404 }] });
    expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1423', message: 'routes/sin.load has no handler yet' })]);
    expect(r.body['next']).toBe('routes/sin.load has no handler yet: fudic_contract says what to write.');
  }, SLOW);
});

describe('a route with its fixture (SDD-82 criterion 37)', () => {
  it('what the fixture names, painted in place of load; no call to a load that did not run', async () => {
    const r = await render({ route: '/sin', fixture: { data: 'nadie' } });
    expect(r.isError).toBe(false);
    expect(r.body).toMatchObject({ route: '/sin', fixture: { data: 'nadie' }, status: 200, outline: '- main:\n  - heading "Nadie" [level=1]', calls: [] });
    expect(r.diagnostics).toEqual([]);
  }, SLOW);

  it('a name the fixture does not have: FUD1516, nothing painted', async () => {
    const r = await render({ route: '/sin', fixture: 'todos' });
    expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1516', message: 'the fixture has no data "todos"; it has: [nadie]' })]);
  }, SLOW);
});

describe('a component that calls a function (criterion 3)', () => {
  it('linking its .fudapi, it is painted; the call without handler gives its 404 and FUD1423', async () => {
    const r = await render({ component: 'app-finder' });
    const fn = 'components/app-finder/app-finder.find';

    expect(r.diagnostics.map((d) => d.code)).toEqual(['FUD1423']);
    expect(r.body['calls']).toEqual([{ fn, status: 404 }]);
    expect(r.diagnostics[0]!.message).toBe(`${fn} has no handler yet`);
  }, SLOW);
});

describe('in the browser (criterion 4)', () => {
  it('the same outline as happy-dom with no CSS that hides; a different one with display: none', async () => {
    const browser = await render({ component: 'app-button', fixture: 'disabled', engine: 'browser' });
    expect(browser.body).toMatchObject({ engine: 'browser', outline: '- button "Save" [disabled]' });

    const hiddenDom = await render({ component: 'app-button', fixture: 'hidden' });
    const hiddenBrowser = await render({ component: 'app-button', fixture: 'hidden', engine: 'browser' });
    expect(hiddenBrowser.isError).toBe(false);
    expect(hiddenBrowser.body['outline']).not.toBe(hiddenDom.body['outline']);
    expect(hiddenBrowser.body['outline']).not.toContain('button');
  }, SLOW);
});

describe('what goes wrong (criterion 5)', () => {
  it('a pattern: FUD1422 with the URLs of paths()', async () => {
    const r = await render({ route: '/productos/:id' });
    expect(r.isError).toBe(true);
    expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1422', message: expect.stringContaining('try one of: /productos/1, /productos/2') })]);
  }, SLOW);

  it('a load that throws: FUD1420 at the throw', async () => {
    const r = await render({ route: '/productos/roto' });
    expect(r.isError).toBe(true);
    expect(r.diagnostics).toEqual([
      expect.objectContaining({ code: 'FUD1420', message: '/productos/roto threw while rendering: the database is down', at: 'src/server/productos.ts:4:39' }),
    ]);
  }, SLOW);

  it('a case that does not exist: FUD1421 with the cases there are', async () => {
    const r = await render({ component: 'app-button', fixture: 'big' });
    expect(r.isError).toBe(true);
    expect(r.diagnostics).toEqual([
      expect.objectContaining({ code: 'FUD1421', message: 'the fixture of app-button has no case "big"; its cases are: primary, disabled, hidden, picking' }),
    ]);
  }, SLOW);

  it('a prop that is a function, in the browser: FUD1428', async () => {
    const r = await render({ component: 'app-button', fixture: 'picking', engine: 'browser' });
    expect(r.isError).toBe(true);
    expect(r.diagnostics).toEqual([expect.objectContaining({ code: 'FUD1428', message: expect.stringContaining('the prop onPick is not JSON') })]);
  }, SLOW);
});

describe('the view (criterion 6)', () => {
  it('the preview carries the DSD and the global sheets inline, and no script', async () => {
    const r = await render({ component: 'app-button', fixture: 'primary' });
    expect(r.preview).toBeDefined();
    const preview = r.preview!;
    expect(preview).toMatch(/^<!doctype html>/u);
    expect(preview).toContain('<template shadowrootmode="open">');
    expect(preview).toContain('<style>button{border-radius:4px;}</style>');
    expect(preview).not.toMatch(/<script/iu);

    const route = await render({ route: '/productos/2' });
    expect(route.preview).toContain('<h1>Producto 2</h1>');
    expect(route.preview).not.toMatch(/<script/iu);
  }, SLOW);
});
