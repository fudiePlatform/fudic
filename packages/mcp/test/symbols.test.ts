/**
 * `fudic_symbols`, `fudic_describe` and `fudic_contract` (SDD-77 §4.7, §8.2.25–30, criteria 15–17):
 * what exists, as the editor knows it. Over `examples/workspace/apps/tienda`, whose library and
 * guide come through its packages, and over new apps with `.fudapi` of their own.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { signatureOf } from '../src/symbols.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, newApp, tempDir } from './helpers.js';

const TIENDA = fileURLToPath(new URL('../../../examples/workspace/apps/tienda', import.meta.url));

type Body = Record<string, unknown>;

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<{ readonly body: Body; readonly isError: boolean }> {
  const result = await client.callTool({ name, arguments: args });
  return { body: result.structuredContent as Body, isError: result.isError === true };
}

const codes = (body: Body): string[] => (body['diagnostics'] as { code: string }[]).map((d) => d.code);

function write(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

describe('over examples/workspace/apps/tienda (criteria 15 and 16)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await connect(createServer({ project: openProject(TIENDA, () => 'b59fa7d'), entry: 'stdio' }));
  }, 120_000);

  afterAll(async () => {
    await client.close();
  });

  it('components: the library\'s ui-card with its doc, at by its package', async () => {
    const { body } = await call(client, 'fudic_symbols', { kind: 'components' });
    const symbols = body['symbols'] as Body[];
    expect(symbols.every((s) => s['kind'] === 'components')).toBe(true);
    expect(symbols.find((s) => s['name'] === 'ui-card')).toEqual({
      kind: 'components',
      name: 'ui-card',
      from: '@fudic/example-ui',
      doc: 'A card with a title, framed with the guide\'s tokens.',
      at: '@fudic/example-ui/src/components/ui-card/ui-card.fud',
    });
    expect(symbols.find((s) => s['name'] === 'tienda-card')).toMatchObject({ from: null, at: 'src/components/tienda-card/tienda-card.fud' });
    expect(body['next']).toBeNull();
  }, 120_000);

  it('tokens: the guide\'s, with their doc, in the order they are adopted, then the app\'s own', async () => {
    const { body } = await call(client, 'fudic_symbols', { kind: 'tokens' });
    const tokens = body['symbols'] as Body[];
    expect(tokens.map((t) => [t['name'], t['from']])).toEqual([
      ['--guia-ink', '@fudic/example-guia'],
      ['--guia-line', '@fudic/example-guia'],
      ['--guia-accent', '@fudic/example-guia'],
      ['--guia-radius', '@fudic/example-guia'],
      ['--guia-pad', '@fudic/example-guia'],
      ['--guia-accent', null],
    ]);
    expect(tokens[0]).toEqual({ kind: 'tokens', name: '--guia-ink', from: '@fudic/example-guia', value: '#1c1c1e', doc: 'Body text.', at: '@fudic/example-guia/tokens.css:9:3' });
    // Two segments: no group.
    expect(tokens.some((t) => 'group' in t)).toBe(false);
    expect(tokens.at(-1)).toMatchObject({ at: 'src/tienda.css:11:3' });
  }, 120_000);

  it('a library pipe is named by its package too', async () => {
    const { body } = await call(client, 'fudic_symbols', { kind: 'pipes' });
    expect(body['symbols']).toEqual([
      {
        kind: 'pipes',
        name: 'iniciales',
        from: '@fudic/example-ui',
        doc: 'The initials of a name, upper case: "ada lovelace" → "AL".',
        at: '@fudic/example-ui/src/pipes/iniciales.fudapi:2:1',
      },
    ]);
  }, 120_000);

  it('everything at once, in the order of the kinds', async () => {
    const { body } = await call(client, 'fudic_symbols', {});
    const kinds = (body['symbols'] as Body[]).map((s) => s['kind']);
    expect([...new Set(kinds)]).toEqual(['routes', 'components', 'pipes', 'tokens']);
    expect((body['symbols'] as Body[]).filter((s) => s['kind'] === 'routes').map((s) => s['name'])).toEqual(['/', '/catalogo']);
  }, 120_000);

  it('describe ui-card: the contract, its link, where it is used, and an example', async () => {
    const { body, isError } = await call(client, 'fudic_describe', { name: 'ui-card' });
    expect(isError).toBe(false);
    expect(body).toMatchObject({
      kind: 'component',
      name: 'ui-card',
      from: '@fudic/example-ui',
      link: '<link rel="component" href="@fudic/example-ui/ui-card.fud">',
      at: '@fudic/example-ui/src/components/ui-card/ui-card.fud',
      example: { text: '<ui-card .title=@(\'\')>\n  Text\n</ui-card>', fill: [] },
      next: null,
    });
    expect(body['contract']).toMatchObject({
      props: [{ name: 'title', required: true, type: 'string', doc: 'The heading of the card: one short line.' }],
      defaultSlot: true,
      slots: [],
      events: [],
      tokens: ['--guia-line', '--guia-accent', '--guia-radius', '--guia-pad'],
    });
    expect(body['usedIn']).toEqual([expect.stringMatching(/^src\/routes\/index\.fud:\d+:\d+$/u)]);
  }, 120_000);

  it('the example, pasted in a route with its link, compiles', async () => {
    const { body } = await call(client, 'fudic_describe', { name: 'ui-card' });
    const route = join(TIENDA, 'src', 'routes', 'mcp-example.fud');
    const layout = '<link rel="layout" href="../layouts/_layout.fud">';
    try {
      writeFileSync(route, `${layout}\n${body['link'] as string}\n\n${(body['example'] as { text: string }).text}\n`);
      const check = await call(client, 'fudic_check', { paths: ['src/routes/mcp-example.fud'] });
      expect(check.body['diagnostics']).toEqual([]);
    } finally {
      rmSync(route, { force: true });
    }
  }, 120_000);

  it('describe a route and a token', async () => {
    expect((await call(client, 'fudic_describe', { name: '/catalogo' })).body).toMatchObject({ kind: 'route', name: '/catalogo', declares: [], at: 'src/routes/catalogo.fud' });
    expect((await call(client, 'fudic_describe', { name: '--guia-ink' })).body).toMatchObject({ kind: 'token', value: '#1c1c1e', doc: 'Body text. Use it for anything read, never for a border.' });
  }, 120_000);

  it('a name nothing has: FUD1405, with the nearest one', async () => {
    const { body, isError } = await call(client, 'fudic_describe', { name: 'ui-crad' });
    expect(isError).toBe(true);
    expect((body['diagnostics'] as { message: string }[])[0]!.message).toBe('nothing in the project is called ui-crad; did you mean ui-card?');
    const far = await call(client, 'fudic_describe', { name: 'zzzzzzzzzzzz' });
    expect((far.body['diagnostics'] as { message: string }[])[0]!.message).toBe('nothing in the project is called zzzzzzzzzzzz');
  }, 120_000);
});

describe('functions and their handlers (criteria 15 and 17)', () => {
  let app: Awaited<ReturnType<typeof newApp>>;
  let client: Client;

  const SHOP_API = '# How many there are.\nget count\n  -> i32\n\n# What they cost.\nget total\n  -> i32\n';
  const SHOP_PAGE = '<link rel="layout" href="../layouts/_layout.fud">\n<link rel="server" href="./shop.fudapi">\n\n<h1>Shop</h1>\n';

  beforeAll(async () => {
    app = await newApp();
    write(app.root, {
      'src/routes/shop.fudapi': SHOP_API,
      'src/routes/shop.fud': SHOP_PAGE,
      'src/server/counting.ts': "import { count } from 'fudic:routes/shop';\ncount.handle(() => 3);\n",
    });
    client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio' }));
  }, 120_000);

  afterAll(async () => {
    await client.close();
    app.dispose();
  });

  it('functions: connected with a handler, missing without one, and next says what to ask', async () => {
    const { body } = await call(client, 'fudic_symbols', { kind: 'functions' });
    expect(body['symbols']).toEqual([
      { kind: 'functions', name: 'routes/shop.count', from: null, doc: 'How many there are.', state: 'connected', at: 'src/routes/shop.fudapi:2:1' },
      { kind: 'functions', name: 'routes/shop.total', from: null, doc: 'What they cost.', state: 'missing', at: 'src/routes/shop.fudapi:6:1' },
    ]);
    expect(body['next']).toBe('routes/shop.total has no handler yet: fudic_contract { id: "routes/shop" } says what to write.');
  }, 120_000);

  it('describe a function: its lines, its state and who implements it', async () => {
    const { body } = await call(client, 'fudic_describe', { name: 'routes/shop.count' });
    expect(body).toMatchObject({
      kind: 'function',
      name: 'routes/shop.count',
      from: null,
      doc: 'How many there are.',
      source: 'get count\n  -> i32',
      state: 'connected',
      implementedIn: ['src/server/counting.ts'],
      at: 'src/routes/shop.fudapi:2:1',
    });
    expect((await call(client, 'fudic_describe', { name: '/shop' })).body).toMatchObject({ kind: 'route', api: 'src/routes/shop.fudapi', declares: [] });
  }, 120_000);

  it('contract: each handler with its signature and its file, and a skeleton of what is missing', async () => {
    const { body } = await call(client, 'fudic_contract', { id: 'routes/shop' });
    expect(body['handlers']).toEqual([
      {
        name: 'routes/shop.count',
        exported: 'count',
        state: 'connected',
        file: 'src/server/routes/shop.ts',
        signature: expect.stringContaining('export const count'),
        implementedIn: ['src/server/counting.ts'],
      },
      {
        name: 'routes/shop.total',
        exported: 'total',
        state: 'missing',
        file: 'src/server/routes/shop.ts',
        signature: expect.stringContaining('export const total'),
        implementedIn: [],
      },
    ]);
    expect(body['skeleton']).toEqual([
      {
        file: 'src/server/routes/shop.ts',
        exists: false,
        text: "import { total } from 'fudic:routes/shop';\n\ntotal.handle(() => {\n  throw new Error('routes/shop.total: not written yet');\n});\n",
      },
    ]);
    expect(body['next']).toBe('Write the skeleton in src/server/routes/shop.ts (add to a file that exists), then replace each throw with the real code and run fudic_check.');
  }, 120_000);

  it('the skeleton written where it goes: the function is connected, and the project has no diagnostic', async () => {
    const { body } = await call(client, 'fudic_contract', { id: 'routes/shop' });
    const [skeleton] = body['skeleton'] as { file: string; text: string }[];
    write(app.root, { [skeleton!.file]: skeleton!.text });
    const functions = (await call(client, 'fudic_symbols', { kind: 'functions' })).body;
    expect((functions['symbols'] as Body[]).map((s) => s['state'])).toEqual(['connected', 'connected']);
    expect(functions['next']).toBeNull();
    const check = (await call(client, 'fudic_check', {})).body;
    expect(check['diagnostics']).toEqual([]);
    const again = (await call(client, 'fudic_contract', { id: 'routes/shop' })).body;
    expect(again['skeleton']).toEqual([]);
    expect(again['next']).toBeNull();
  }, 120_000);

  it('an id nothing has: FUD1405 with the nearest .fudapi of the app', async () => {
    const { body, isError } = await call(client, 'fudic_contract', { id: 'routes/shpo' });
    expect(isError).toBe(true);
    expect((body['diagnostics'] as { message: string }[])[0]!.message).toBe('nothing in the project is called routes/shpo; did you mean routes/shop?');
    const far = (await call(client, 'fudic_contract', { id: 'qqqqqqqqqqqq' })).body;
    expect((far['diagnostics'] as { message: string }[])[0]!.message).toBe('nothing in the project is called qqqqqqqqqqqq');
  }, 120_000);
});

describe('where each kind of handler goes (§8.2.30)', () => {
  let app: Awaited<ReturnType<typeof newApp>>;
  let client: Client;

  beforeAll(async () => {
    app = await newApp();
    write(app.root, {
      'fudic.json': JSON.stringify({ id: 'demo', kind: 'app', prefix: 'app', server: 'src/backend', browser: 'src/front' }),
      'src/middlewares/auth.fudapi': '# Who is calling.\nmiddleware auth\n  client\n  server\n',
      'src/rules/people.fudapi': 'rule email-taken\n  on field str\n  runs both\n  fails email-taken\n\nrule nif\n  on field str\n  runs server\n  fails taken\n',
      'src/pipes/shout.fudapi': '# Loud.\npipe shout\n  on str\n',
      'src/backend/middlewares/auth.ts': '// written by hand: the skeleton is added, not replacing this\n',
    });
    client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio' }));
  }, 120_000);

  afterAll(async () => {
    await client.close();
    app.dispose();
  });

  it('a middleware: its client half in the browser folder, its server half in the server one; an existing file is added to', async () => {
    const { body } = await call(client, 'fudic_contract', { id: 'middlewares/auth' });
    expect((body['handlers'] as Body[]).map((h) => [h['name'], h['file']])).toEqual([['middlewares/auth.auth', 'src/front/middlewares/auth.ts']]);
    expect(body['skeleton']).toEqual([
      {
        file: 'src/front/middlewares/auth.ts',
        exists: false,
        text: "import { auth } from 'fudic:middlewares/auth';\n\nauth.client(() => {\n  throw new Error('middlewares/auth.auth: not written yet');\n});\n\nauth.server(() => {\n  throw new Error('middlewares/auth.auth: not written yet');\n});\n",
      },
    ]);
  }, 120_000);

  it('a rule that runs both goes to the browser; one that runs on the server, to the server', async () => {
    const { body } = await call(client, 'fudic_contract', { id: 'rules/people' });
    expect((body['handlers'] as Body[]).map((h) => [h['exported'], h['file']])).toEqual([
      ['emailTaken', 'src/front/rules/people.ts'],
      ['nif', 'src/backend/rules/people.ts'],
    ]);
    expect((body['skeleton'] as { text: string }[]).map((s) => s.text.split('\n')[2])).toEqual(['emailTaken.check(() => {', 'nif.check(() => {']);
  }, 120_000);

  it('a pipe beside its .fudapi, as its default export', async () => {
    const { body } = await call(client, 'fudic_contract', { id: 'pipes/shout' });
    expect(body['skeleton']).toEqual([
      {
        file: 'src/pipes/shout.ts',
        exists: false,
        text: "import { shout } from 'fudic:pipes/shout';\n\nexport default shout.implement(() => {\n  throw new Error('pipes/shout: not written yet');\n});\n",
      },
    ]);
  }, 120_000);

  it('symbols: middlewares and pipes with their state; describe a type-less declaration has no implementers', async () => {
    const { body } = await call(client, 'fudic_symbols', {});
    const kinds = (body['symbols'] as Body[]).filter((s) => s['kind'] === 'middlewares' || s['kind'] === 'pipes');
    expect(kinds.map((s) => [s['kind'], s['name'], s['state']])).toEqual([
      ['middlewares', 'auth', 'missing'],
      ['pipes', 'shout', 'missing'],
    ]);
    expect((await call(client, 'fudic_describe', { name: 'shout' })).body).toMatchObject({ kind: 'pipe', state: 'missing', implementedIn: [] });
  }, 120_000);
});

describe('outside a fudic project', () => {
  it('symbols, describe and contract: FUD1404', async () => {
    const dir = tempDir();
    const client = await connect(createServer({ project: openProject(dir.root, () => 'x'), entry: 'stdio' }));
    try {
      for (const [name, args] of [
        ['fudic_symbols', {}],
        ['fudic_describe', { name: 'x' }],
        ['fudic_contract', { id: 'x' }],
      ] as const) {
        const { body, isError } = await call(client, name, args);
        expect(isError, name).toBe(true);
        expect(codes(body)).toEqual(['FUD1404']);
      }
    } finally {
      await client.close();
      dir.dispose();
    }
  });
});

describe('signatureOf', () => {
  const TYPES = [
    "declare module 'fudic:routes/shop' {",
    '  /** How many. */',
    '  export type CountHandler = () => number;',
    '  export const count: { handle(fn: CountHandler): void };',
    '',
    '  export const total: { handle(fn: () => number): void };',
    '}',
  ].join('\n');

  it('the block of the .d.ts above the const, unindented, up to a blank line or the module', () => {
    expect(signatureOf(TYPES, 'count')).toBe('/** How many. */\nexport type CountHandler = () => number;\nexport const count: { handle(fn: CountHandler): void };');
    expect(signatureOf(TYPES, 'total')).toBe('export const total: { handle(fn: () => number): void };');
  });

  it('nothing for a name it does not export, or a const that starts the file', () => {
    expect(signatureOf(TYPES, 'cou')).toBeUndefined();
    expect(signatureOf('export const first = 1;', 'first')).toBe('export const first = 1;');
  });

  it('a missing .d.ts gives no signature', () => {
    expect(signatureOf('', 'count')).toBeUndefined();
    expect(existsSync('/never/.fudic/api/x.d.ts')).toBe(false);
  });
});
