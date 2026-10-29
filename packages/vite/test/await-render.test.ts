/**
 * SDD-70 §3.4, §4.2 — the server render in parts through the route chunk, in a real Vite dev
 * server: criteria 9–11 and 13–15, both for a route with a layout and for a standalone page.
 *
 * The `.fudapi` marks `users` and `stats` `later`, and `src/server` implements `load` by asking
 * the test for each promise: the test hands out promises it resolves by hand, and sees WHEN `load`
 * asked for them. The chunk's `render(ctx)` is the one the plugin runs (`fudic-wrapper:<pattern>`),
 * read chunk by chunk; the HTTP cases go through the plugin's own middleware.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { WRAPPER_PREFIX } from '../src/constants.js';
import { edgeContext, pendingResponse, type PendingResponse, type RenderModule } from '../src/serve.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

// ── what the test controls ──────────────────────────────────────────────────

interface Deferred {
  readonly promise: Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

function deferred(): Deferred {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * What `load` reads on each request, on `globalThis` because `src/server` runs in this same
 * process: the promise of each field, and the log of which one it asked for.
 */
interface Control {
  asked: string[];
  users: () => Promise<unknown>;
  stats: () => Promise<unknown>;
  show: boolean;
}

const control = globalThis as unknown as { __sdd70: Control };

/** A fresh request: two deferreds, handed out when `load` asks. */
function arm(): { users: Deferred; stats: Deferred; asked: string[] } {
  const users = deferred();
  const stats = deferred();
  const asked: string[] = [];
  control.__sdd70 = {
    asked,
    users: () => (asked.push('users'), users.promise),
    stats: () => (asked.push('stats'), stats.promise),
    show: false,
  };
  return { users, stats, asked };
}

// ── the project ─────────────────────────────────────────────────────────────

const LAYOUT = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
@RenderHead()
</head>
<body>
<nav>menu</nav>
<main>@RenderBody()</main>
<footer>pie</footer>
</body>
</html>
`;

const API = `load
  title  str
  users  str[]  later
  stats  i32  later
`;

/** The view both shapes share: before, two `@await` (the second without `@catch`), after. */
const VIEW = `<h1>@data.title</h1>
@await data.users {
  <ul>@foreach (const u of data.users) key (u) { <li>@u</li> }</ul>
} @catch (e) {
  <p class="error">@e.status @e.title [@e.detail]</p>
}
@await data.stats {
  <p class="stats">@data.stats personas</p>
}
<p class="after">fin</p>`;

const ROUTE = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./espera.fudapi">

<head>
  <title>Espera</title>
</head>

${VIEW}
`;

const PAGE = `<!DOCTYPE html>
<html>
<head>
<title>Sola</title>
<link rel="server" href="./sola.fudapi">
</head>
<body><main>
${VIEW}
</main></body>
</html>
`;

/** A route whose `later` field sits in a branch that does not paint (criterion 15). */
const BRANCH = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./rama.fudapi">

@if (data.show) {
  @await data.users { <p>@data.users.length</p> }
}
<p class="after">fin</p>
`;

const BRANCH_API = `load
  show  bool
  users  str[]  later
`;

/** A route whose `load` throws before it returns, `later` fields or not (criterion 14). */
const FAILING = `<link rel="layout" href="../layouts/_layout.fud">
<link rel="server" href="./falla.fudapi">

@await data.users { <p>@data.users.length</p> }
`;

const FAILING_API = `load
  users  str[]  later
`;

const SERVER = `import { notFound } from '@fudic/http';
import { load as espera } from 'fudic:routes/espera';
import { load as sola } from 'fudic:routes/sola';
import { load as rama } from 'fudic:routes/rama';
import { load as falla } from 'fudic:routes/falla';

const control = (): any => (globalThis as any).__sdd70;
// The test rejects with the server's own \`notFound\`: the copy \`problemOf\` checks against.
(globalThis as any).__sdd70notFound = notFound;
const both = (): any => ({ title: 'Usuarios', users: control().users(), stats: control().stats() });

espera.handle(both);
sola.handle(both);
rama.handle((): any => ({ show: control().show, users: control().users() }));
falla.handle(async (): Promise<any> => {
  throw notFound('no está');
});
`;

const ERROR_PAGE = `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body><h1>status @data.status</h1><p>@data.title</p></body>
</html>
`;

function writeAll(root: string, files: Readonly<Record<string, string>>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

let server: ViteDevServer;
let origin: string;

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-await-'));
  writeHttpTypecheckConfig(root);
  writeAll(root, {
    'src/layouts/_layout.fud': LAYOUT,
    'src/routes/espera.fud': ROUTE,
    'src/routes/espera.fudapi': API,
    'src/routes/sola.fud': PAGE,
    'src/routes/sola.fudapi': API,
    'src/routes/rama.fud': BRANCH,
    'src/routes/rama.fudapi': BRANCH_API,
    'src/routes/falla.fud': FAILING,
    'src/routes/falla.fudapi': FAILING_API,
    'src/routes/_error.fud': ERROR_PAGE,
    'src/server/routes.ts': SERVER,
    'sw.json': JSON.stringify({ shell: [] }),
    'fudic.json': JSON.stringify({ id: 'await' }),
  });
  server = await createServer({
    root,
    logLevel: 'silent',
    resolve: { alias: httpAlias },
    plugins: [fudic({ liveCheck: false })],
    server: { port: 0 },
  });
  await server.listen();
  origin = `http://localhost:${(server.httpServer!.address() as AddressInfo).port}`;
  // The first request loads the server root (SDD-60 §4.4): here, not inside a case's 5 s.
  arm();
  await fetch(`${origin}/_fudic/data/falla`);
}, 120000);

afterAll(async () => {
  await server.close();
});

// ── reading the chunk ───────────────────────────────────────────────────────

/** The route chunk's `render(ctx)`, with the response it writes its status to. */
async function render(
  pattern: string,
  onError?: (error: unknown) => void,
): Promise<{ stream: ReadableStream<Uint8Array>; response: PendingResponse }> {
  const mod = (await server.ssrLoadModule(WRAPPER_PREFIX + pattern)) as RenderModule;
  const response = pendingResponse();
  const ctx = { ...edgeContext(pattern, pattern, ''), response, ...(onError === undefined ? {} : { onError }) };
  return { stream: mod.render(ctx), response };
}

function chunks(stream: ReadableStream<Uint8Array>): { next: () => Promise<string | null>; pending: () => Promise<boolean> } {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let inFlight: Promise<string | null> | undefined;
  const read = (): Promise<string | null> =>
    reader.read().then(({ done, value }) => (done ? null : decoder.decode(value)));
  return {
    next: () => {
      const p = inFlight ?? read();
      inFlight = undefined;
      return p;
    },
    /** Whether the next chunk is still not there once the event loop has turned. */
    pending: async () => {
      inFlight ??= read();
      let arrived = false;
      void inFlight.then(() => (arrived = true));
      await new Promise<void>((r) => setImmediate(r));
      return !arrived;
    },
  };
}

async function rest(reader: ReturnType<typeof chunks>): Promise<string> {
  let out = '';
  for (let c = await reader.next(); c !== null; c = await reader.next()) out += c;
  return out;
}

const SHAPES = [
  ['a route with a layout', '/espera'],
  ['a standalone page', '/sola'],
] as const;

// ── criteria ────────────────────────────────────────────────────────────────

describe.each(SHAPES)('the render in parts — %s', (_name, pattern) => {
  it('criterion 9: the head and part 0 are the first chunk, before the later field settles', async () => {
    const { users, stats } = arm();
    const reader = chunks((await render(pattern)).stream);
    const first = (await reader.next())!;
    expect(first).toContain('</head>');
    expect(first).toContain('<h1>Usuarios');
    expect(first).toContain('<!--fud-end-->');
    expect(first).not.toContain('<ul>');
    expect(new TextEncoder().encode(first).length).toBeLessThan(8192);
    expect(await reader.pending()).toBe(true);

    users.resolve(['Ana']);
    stats.resolve(2);
    const tail = await rest(reader);
    expect(tail).toContain('<li>Ana</li>');
    expect(tail).toContain('<p class="stats">2 personas</p>');
    expect(tail.endsWith('</html>')).toBe(true);
  });

  it('criterion 11: both promises start when load is called, before either settles', async () => {
    const { users, stats, asked } = arm();
    const reader = chunks((await render(pattern)).stream);
    await reader.next();
    // Part 0 is out and nothing has settled: `load` already asked for both.
    expect(asked).toEqual(['users', 'stats']);
    users.resolve([]);
    stats.resolve(0);
    await rest(reader);
    expect(asked).toEqual(['users', 'stats']);
  });

  it('criterion 10: settled in reverse, the part of the first @await still goes out first', async () => {
    const { users, stats } = arm();
    const reader = chunks((await render(pattern)).stream);
    await reader.next();
    stats.resolve(12);
    expect(await reader.pending()).toBe(true);
    users.resolve(['Ana', 'Luis']);
    const second = (await reader.next())!;
    expect(second).toMatch(/<li>Ana<\/li>\s*<li>Luis<\/li>/u);
    expect(second).not.toContain('class="stats"');
    const tail = await rest(reader);
    expect(tail).toContain('<p class="stats">12 personas</p>');
  });

  it('criterion 13: notFound() paints the @catch with 404, and the response stays 200', async () => {
    const { users, stats } = arm();
    const { stream, response } = await render(pattern);
    const reader = chunks(stream);
    const first = (await reader.next())!;
    users.reject((globalThis as unknown as { __sdd70notFound: () => Error }).__sdd70notFound());
    stats.resolve(1);
    const html = first + (await rest(reader));
    expect(html).toContain('<p class="error">404 Not Found []</p>');
    expect(html).not.toContain('<ul>');
    expect(html).toContain('<p class="stats">1 personas</p>');
    expect(response.status).toBe(200);
  });

  it('criterion 13: a plain Error paints the @catch with 500, its message in dev', async () => {
    const { users, stats } = arm();
    const reader = chunks((await render(pattern)).stream);
    await reader.next();
    users.reject(new Error('db down'));
    stats.resolve(1);
    expect(await rest(reader)).toContain('<p class="error">500 Internal Server Error [db down]</p>');
  });

  it('criterion 13: without a @catch the part is empty, the error reaches onError, what follows paints', async () => {
    const { users, stats } = arm();
    const errors: unknown[] = [];
    const reader = chunks((await render(pattern, (e) => errors.push(e))).stream);
    await reader.next();
    const cause = new Error('stats down');
    users.resolve([]);
    stats.reject(cause);
    const html = await rest(reader);
    expect(errors).toEqual([cause]);
    expect(html).not.toContain('class="stats"');
    expect(html).toContain('<p class="after">fin');
  });
});

describe('through the dev server', () => {
  const page = (path: string) => fetch(`${origin}${path}`, { headers: { accept: 'text/html' }, redirect: 'manual' });

  it('criterion 13: a later field that fails with no @catch answers 200, and goes to the overlay', async () => {
    // The dev server drains the page before it answers (until SDD-70 phase 6): the field is
    // settled when `load` asks for it, the failure born inside `load` as a real one would be.
    arm();
    control.__sdd70.users = () => Promise.resolve(['Ana']);
    control.__sdd70.stats = () => Promise.reject(new Error('stats down'));
    const sent: unknown[] = [];
    const original = server.ws.send.bind(server.ws);
    server.ws.send = ((payload: unknown) => {
      sent.push(payload);
    }) as typeof server.ws.send;
    try {
      const res = await page('/espera');
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('<li>Ana</li>');
      expect(html).toContain('<p class="after">fin');
    } finally {
      server.ws.send = original;
    }
    expect(sent).toContainEqual(expect.objectContaining({ type: 'error', err: expect.objectContaining({ message: 'stats down' }) }));
  });

  it('criterion 14: a load that throws notFound() before returning answers 404 with its error page', async () => {
    arm();
    const res = await page('/falla');
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain('status 404');
    expect(html).toContain('Not Found');
  });
});

describe('criterion 15 — a later field in a branch that does not paint', () => {
  it('rejects without an unhandled rejection, and the render does not wait for it', async () => {
    const unhandled: unknown[] = [];
    const listen = (reason: unknown): void => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', listen);
    try {
      const { users } = arm();
      const reader = chunks((await render('/rama')).stream);
      // The page ends with `users` still pending: nothing waits for it.
      const html = await rest(reader);
      expect(html).toContain('<p class="after">fin');
      expect(html).not.toContain('<p>0</p>');
      users.reject(new Error('never awaited'));
      await new Promise<void>((r) => setImmediate(r));
      await new Promise<void>((r) => setImmediate(r));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listen);
    }
  });
});
