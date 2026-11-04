/**
 * The edges of `fudic_describe` and `fudic_contract` (SDD-77 §4.7, §8.2.29–30): an example that
 * cannot give every prop a value, an id with nothing near it, and a library's pipe, whose types
 * are its package's and not the project's.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { openProject } from '../src/project.js';
import { createServer } from '../src/server.js';
import { connect, newApp } from './helpers.js';

const TIENDA = fileURLToPath(new URL('../../../examples/workspace/apps/tienda', import.meta.url));

type Body = Record<string, unknown>;

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Body> {
  return (await client.callTool({ name, arguments: args })).structuredContent as Body;
}

describe('over a new app', { timeout: 120_000 }, () => {
  let app: { readonly root: string; dispose(): void };
  let client: Client;

  beforeAll(async () => {
    app = await newApp();
    const file = join(app.root, 'src/components/app-picker/app-picker.fud');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(
      file,
      '@code {\n  const { onPick } = props<{ onPick: (n: number) => void }>();\n}\n\n<app-picker>\n  <template shadowrootmode="open">\n    <p>Pick</p>\n  </template>\n</app-picker>\n',
    );
    client = await connect(createServer({ project: openProject(app.root, () => 'b59fa7d'), entry: 'stdio' }));
  }, 120_000);

  afterAll(async () => {
    await client.close();
    app.dispose();
  });

  it('a required prop with no honest sample is left to fill, and next says so', async () => {
    const body = await call(client, 'fudic_describe', { name: 'app-picker' });
    expect(body['example']).toMatchObject({ fill: ['onPick'] });
    expect(body['next']).toBe('The example leaves onPick for you: no value of its type compiles on its own.');
  });

  it('a contract of an id when the project has no .fudapi: FUD1405, with nothing to suggest', async () => {
    const body = await call(client, 'fudic_contract', { id: 'routes/nope' });
    const [diagnostic] = body['diagnostics'] as { code: string; message: string }[];
    expect(diagnostic?.code).toBe('FUD1405');
    expect(diagnostic?.message).not.toMatch(/did you mean/iu);
  });
});

describe('over examples/workspace/apps/tienda', { timeout: 120_000 }, () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect(createServer({ project: openProject(TIENDA, () => 'b59fa7d'), entry: 'stdio' }));
  }, 120_000);
  afterAll(async () => {
    await client.close();
  });

  it('a library\'s pipe: its handler and its signature, from the types the check wrote', async () => {
    const body = await call(client, 'fudic_contract', { id: '@fudic/example-ui/pipes/iniciales' });
    expect(body['diagnostics'] ?? []).toEqual([]);
    const [handler] = body['handlers'] as Body[];
    expect(handler?.['signature']).toEqual(expect.stringContaining('iniciales'));
  });
});
