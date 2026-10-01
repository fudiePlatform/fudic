/**
 * SDD-35 criteria 18 and 20 against a real `vite dev` server: what the browser gets.
 *
 * Vite's error middleware answers a `next(err)` with a page that mounts its overlay over the
 * error it serialises — `message`, `id`, `loc`, `frame`. So "the overlay with `loc` and
 * `frame`" is observable from outside as that page and the error inside it, and that is what
 * these tests read. `dev-typecheck.test.ts` covers the live check's own wiring; this file is
 * the end of the line.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, createLogger, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { runtimeAlias, writeTypecheckConfig } from './helpers/alias.js';

const BADGE = `@code {
  type Tone = 'neutral' | 'success' | 'info';
  const { tone = 'neutral' } = props<{ tone?: Tone }>();
}

<app-badge>
  <template shadowrootmode="open"><span>@tone</span></template>
</app-badge>
`;

/** A component whose `@client` does not compile: its chunk fails, not the page's check. */
const BAD_CLIENT = `@code {
  @client {
    const = ;
  }
}

<x-bad>
  <template shadowrootmode="open"><p>bad</p></template>
</x-bad>
`;

const page = (links: readonly string[], body: string): string => `<!DOCTYPE html>
<html>
  <head>
${links.map((name) => `    <link rel="component" href="../components/${name}.fud">\n`).join('')}    <title>Test</title>
  </head>
  <body>
${body}
  </body>
</html>
`;

let server: ViteDevServer;
let origin: string;
let root: string;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'fudic-dev-typecheck-'));
  writeTypecheckConfig(root);
  const files: Record<string, string> = {
    'src/components/app-badge.fud': BADGE,
    'src/components/x-bad.fud': BAD_CLIENT,
    // `.tone="@(42)"` on line 8, `tone` at column 17: the editor marks it, so dev refuses it.
    'src/routes/broken.fud': page(['app-badge'], '    <app-badge .tone="@(42)">hi</app-badge>'),
    'src/routes/fine.fud': page(['app-badge'], `    <app-badge .tone="@('info')">hi</app-badge>`),
    'src/routes/scripted.fud': page(['x-bad'], '    <x-bad></x-bad>'),
  };
  for (const [relative, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, relative)), { recursive: true });
    writeFileSync(join(root, relative), text);
  }
  writeFileSync(join(root, 'fudic.json'), JSON.stringify({ id: 'test' }));
  const logger = createLogger('silent');
  server = await createServer({
    root,
    logLevel: 'silent',
    customLogger: logger,
    resolve: { alias: { ...runtimeAlias } },
    plugins: [fudic()],
    server: { port: 0 },
  });
  await server.listen();
  const address = server.httpServer!.address() as AddressInfo;
  origin = `http://localhost:${address.port}`;
}, 120_000);

afterAll(async () => {
  await server.close();
});

/** The error Vite's overlay page carries, as it serialised it. */
function overlayError(body: string): { message: string; id?: string; frame: string; loc?: { file: string; line: number; column: number } } {
  const json = /const error = (\{.*\})\n/u.exec(body)?.[1];
  expect(json).toBeDefined();
  return JSON.parse(json!.replace(/\\u003c/gu, '<')) as ReturnType<typeof overlayError>;
}

describe('vite dev — a page whose graph has a type error (criterion 18)', () => {
  it('is not served: the response is Vite’s overlay, with the error’s loc and frame', async () => {
    const res = await fetch(`${origin}/broken`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('<app-badge');
    const error = overlayError(body);
    expect(error.message).toMatch(/^TS2322: /u);
    expect(error.loc).toMatchObject({ line: 8, column: 17 });
    expect(error.loc?.file.replace(/\\/gu, '/')).toMatch(/src\/routes\/broken\.fud$/u);
    expect(error.frame).toContain('<app-badge .tone="@(42)">hi</app-badge>');
    expect(error.frame).toContain('────');
  });

  it('a page whose graph is clean is served, even with another page broken', async () => {
    const res = await fetch(`${origin}/fine`, { headers: { accept: 'text/html' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<app-badge');
  }, 60_000);
});

describe('vite dev — fudic’s scripts (criterion 20)', () => {
  it('a component chunk that fails reaches the overlay, not a 500 with a comment', async () => {
    const res = await fetch(`${origin}/@fudic/h/x-bad.js`);
    const body = await res.text();
    expect(body).not.toContain('// fudic dev: failed');
    expect(res.status).toBe(500);
    const error = overlayError(body);
    expect(error.message).toContain('FUD0170');
    expect(error.loc?.file.replace(/\\/gu, '/')).toMatch(/src\/components\/x-bad\.fud$/u);
    expect(error.loc?.line).toBe(3);
    expect(error.frame).toContain('const = ;');
  });
});
