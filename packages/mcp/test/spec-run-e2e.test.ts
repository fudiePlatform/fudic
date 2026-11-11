/**
 * `fudic_spec_run` of a page and a flow, from end to end (SDD-82 criterion 37): a client of the
 * server over an app of `fudic new` with a route, its fixture, a component that calls a function
 * as it hydrates, the route's `.fudspec` and a flow. The project's own workbench runs them in a
 * browser; the answer carries every call of each criterion, and `record` writes the fixture.
 * Slow: every run starts the bench.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, newApp } from './helpers.js';

const FILES: Readonly<Record<string, string>> = {
  'src/routes/gente.fud': [
    '<link rel="layout" href="../layouts/_layout.fud">',
    '<link rel="server" href="./gente.fudapi">',
    '<link rel="component" href="../components/app-finder/app-finder.fud">',
    '',
    '<h1>@data.title</h1>',
    '<app-finder></app-finder>',
    '',
  ].join('\n'),
  'src/routes/gente.fudapi': 'load\n  title  str\n',
  'src/routes/gente.fixture.ts': [
    "import type { Fixtures } from 'fudic:routes/gente';",
    '',
    'export default {',
    '  data: {',
    "    dos: { title: 'Dos' },",
    '  },',
    '  calls: {',
    "    encontrado: { find: 'de la fixture' },",
    '  },',
    '} satisfies Fixtures;',
    '',
  ].join('\n'),
  'src/routes/gente.fudspec': [
    'page /gente',
    '',
    'criterion con-la-fixture',
    '  given',
    '    data dos',
    '    answers encontrado',
    '  then',
    '    text h1 "Dos"',
    '    text app-finder "de la fixture"',
    '    called find 1',
    '',
    'criterion de-verdad',
    '  then',
    '    text h1 "Real"',
    '    text app-finder "de verdad"',
    '',
  ].join('\n'),
  'src/flows/visita.fudspec': ['flow visita', '', 'criterion abre-gente', '  given', '    url /gente', '  then', '    text h1 "Real"', ''].join('\n'),
  'src/components/app-finder/app-finder.fud': [
    '<link rel="server" href="./app-finder.fudapi">',
    '',
    '@code {',
    '  import { effect, signal } from "@fudic/core";',
    '  const found = signal("");',
    '  effect(() => { void find().then((v) => found.set(v)); });',
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
  'src/server/gente.ts': [
    "import { load } from 'fudic:routes/gente';",
    "import { find } from 'fudic:components/app-finder/app-finder';",
    '',
    "load.handle(() => ({ title: 'Real' }));",
    "find.handle(() => 'de verdad');",
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
  client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio' }));
}, 120_000);

afterAll(async () => {
  await client.close();
  app.dispose();
});

interface Ran {
  readonly body: Record<string, unknown>;
  readonly diagnostics: readonly { code: string; message: string }[];
}

async function specRun(args: Record<string, unknown>): Promise<Ran> {
  const result = await client.callTool({ name: 'fudic_spec_run', arguments: args }, undefined, { timeout: 280_000 });
  const body = result.structuredContent as Record<string, unknown>;
  return { body, diagnostics: body['diagnostics'] as Ran['diagnostics'] };
}

const SLOW = 300_000;

describe('fudic_spec_run of a page and a flow (criterion 37)', () => {
  it('the page: both criteria pass, and every call comes back, answered by the fixture or by the server', async () => {
    const run = await specRun({ spec: '/gente' });
    expect(run.body['criteria']).toEqual([]);
    expect(run.body['summary']).toEqual({ pass: 2, fail: 0, error: 0 });
    expect(run.body['calls']).toEqual([
      { spec: 'src/routes/gente.fudspec', id: 'con-la-fixture', calls: [expect.objectContaining({ fn: 'components/app-finder/app-finder.find', faked: true, status: 200 })] },
      { spec: 'src/routes/gente.fudspec', id: 'de-verdad', calls: [expect.objectContaining({ fn: 'components/app-finder/app-finder.find', faked: false, status: 200 })] },
    ]);
  }, SLOW);

  it('the flow, by its name', async () => {
    const run = await specRun({ spec: 'visita' });
    expect(run.body['summary']).toEqual({ pass: 1, fail: 0, error: 0 });
  }, SLOW);

  it('record: what the real server answered goes into the fixture, the criterion names it, and it passes with it', async () => {
    const run = await specRun({ spec: '/gente', criteria: ['de-verdad'], record: true });
    expect(run.body['recording']).toEqual({ recorded: [{ spec: 'src/routes/gente.fudspec', id: 'de-verdad', data: ['de-verdad'], calls: ['find'] }], skipped: [] });
    const fixture = readFileSync(join(app.root, 'src/routes/gente.fixture.ts'), 'utf8');
    expect(fixture).toContain("'de-verdad': { title: 'Real' }");
    expect(fixture).toContain("'de-verdad': { find: 'de verdad' }");
    expect(readFileSync(join(app.root, 'src/routes/gente.fudspec'), 'utf8')).toContain('    data de-verdad\n    answers de-verdad\n');
    const again = await specRun({ spec: '/gente', criteria: ['de-verdad'] });
    expect(again.body['summary']).toEqual({ pass: 1, fail: 0, error: 0 });
    expect(again.body['calls']).toEqual([expect.objectContaining({ id: 'de-verdad', calls: [expect.objectContaining({ faked: true })] })]);
  }, SLOW);
});
