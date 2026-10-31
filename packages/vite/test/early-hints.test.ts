/**
 * SDD-73 §3.2, §4.1 — the early hints middleware of Node.
 *
 * - The pieces on their own: who wants a `103`, sending it once, the `Link` of the response.
 * - Criteria 3–6 against a real `vite build` and `vite preview` over HTTP/2 (`preview.https`): the
 *   `103` of a navigation arrives while `load` is still waiting — a promise the test holds — and
 *   the final response carries the hints of what it painted; HTTP/1.1, or a request that is no
 *   navigation, gets the `Link` and no `103`; what is no page gets neither; and with
 *   `earlyHints: false`, nothing does.
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build, createServer, preview, type PreviewServer, type ViteDevServer } from 'vite';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { connect, type IncomingHttpHeaders } from 'node:http2';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type AddressInfo } from 'node:net';
import { fudic } from '../src/index.js';
import { sendEarlyHints, setLinkHeader, wantsEarlyHints } from '../src/early-hints.js';
import { httpAlias, writeHttpTypecheckConfig } from './helpers/http-project.js';

describe('the pieces', () => {
  const req = (major: number, mode?: string) =>
    ({ httpVersionMajor: major, headers: mode === undefined ? {} : { 'sec-fetch-mode': mode } }) as never;

  it('wantsEarlyHints: a navigation over HTTP/2 or later, and nothing else', () => {
    expect(wantsEarlyHints(req(2, 'navigate'))).toBe(true);
    expect(wantsEarlyHints(req(3, 'navigate'))).toBe(true);
    expect(wantsEarlyHints(req(1, 'navigate'))).toBe(false);
    expect(wantsEarlyHints(req(2, 'cors'))).toBe(false);
    expect(wantsEarlyHints(req(2))).toBe(false);
  });

  it('sendEarlyHints: the hints, as they are, when wanted and the server can', () => {
    const writeEarlyHints = vi.fn();
    sendEarlyHints(req(2, 'navigate'), { writeEarlyHints } as never, ['</a.css>; rel=preload; as=style']);
    expect(writeEarlyHints).toHaveBeenCalledExactlyOnceWith({ link: ['</a.css>; rel=preload; as=style'] });
  });

  it('sendEarlyHints: nothing with no hints, unwanted, or a server that cannot send a 1xx', () => {
    const writeEarlyHints = vi.fn();
    sendEarlyHints(req(2, 'navigate'), { writeEarlyHints } as never, []);
    sendEarlyHints(req(1, 'navigate'), { writeEarlyHints } as never, ['</a.css>; rel=preload; as=style']);
    expect(writeEarlyHints).not.toHaveBeenCalled();
    expect(() => sendEarlyHints(req(2, 'navigate'), {} as never, ['</a.css>; rel=preload; as=style'])).not.toThrow();
  });

  it('setLinkHeader: the hints in one `Link`, and none when there are none', () => {
    const setHeader = vi.fn();
    setLinkHeader({ setHeader } as never, ['</a.css>; rel=preload; as=style', '</b.js>; rel=modulepreload']);
    expect(setHeader).toHaveBeenCalledExactlyOnceWith('Link', '</a.css>; rel=preload; as=style, </b.js>; rel=modulepreload');
    setHeader.mockClear();
    setLinkHeader({ setHeader } as never, []);
    expect(setHeader).not.toHaveBeenCalled();
  });
});

const CERT = readFileSync(fileURLToPath(new URL('./fixtures/tls/localhost.pem', import.meta.url)));
const KEY = readFileSync(fileURLToPath(new URL('./fixtures/tls/localhost.key', import.meta.url)));
const NODE_TYPES = fileURLToPath(new URL('../node_modules/@types', import.meta.url));
const HTTP_PACKAGE = fileURLToPath(new URL('../../http', import.meta.url));

/** The gate `load` waits on: the test opens it once it has seen the `103`. */
declare global {
  var __fudicGate: Promise<void> | undefined;
}

const page = (name: string, body: string) => ({
  [`src/routes/${name}.fud`]: `<!DOCTYPE html>
<html>
<head>
<title>x</title>
<link rel="server" href="./${name}.fudapi">
<link rel="stylesheet" href="../styles/site.css">
</head>
<body><p class="s">@data.n</p></body>
</html>
`,
  [`src/routes/${name}.fudapi`]: 'load ssr\n  n  i32\n',
  [`src/server/${name}.ts`]: `import { notFound } from '@fudic/http';
import { load } from 'fudic:routes/${name}';

load.handle(async (): Promise<{ n: number }> => {
  ${body}
});
`,
});

const ERROR_PAGE = `<!DOCTYPE html>
<html>
<head><title>Error</title><link rel="stylesheet" href="../styles/error.css"></head>
<body><h1 class="e">status @data.status</h1></body>
</html>
`;

function project(config: Readonly<Record<string, unknown>>): string {
  const root = mkdtempSync(join(tmpdir(), 'fudic-early-hints-'));
  writeHttpTypecheckConfig(root, {
    module: 'esnext',
    moduleResolution: 'bundler',
    verbatimModuleSyntax: true,
    typeRoots: [NODE_TYPES],
    types: ['node'],
  });
  const files: Record<string, string> = {
    ...page('lento', 'await globalThis.__fudicGate;\n  return { n: 1 };'),
    ...page('missing', "throw notFound('no está');"),
    'src/routes/_error.fud': ERROR_PAGE,
    'src/styles/site.css': '.s { color: red }\n',
    'src/styles/error.css': '.e { color: blue }\n',
    'public/x.txt': 'a file\n',
    'sw.json': JSON.stringify({ shell: [] }),
    'fudic.json': JSON.stringify({ id: 'hints', ...config }),
    'package.json': JSON.stringify({ dependencies: { '@fudic/http': '0.0.0' } }),
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  mkdirSync(join(root, 'node_modules', '@fudic'), { recursive: true });
  symlinkSync(HTTP_PACKAGE, join(root, 'node_modules', '@fudic', 'http'), 'junction');
  return root;
}

const config = (root: string) => ({
  root,
  logLevel: 'silent' as const,
  resolve: { alias: httpAlias },
  plugins: [fudic()],
  build: { minify: false },
  preview: { port: 0, https: { cert: CERT, key: KEY } },
});

/** A preview of a fresh build of the project, over HTTP/2, and its origin. */
async function served(fudicJson: Readonly<Record<string, unknown>> = {}): Promise<{ server: PreviewServer; origin: string }> {
  const root = project(fudicJson);
  await build(config(root));
  const server = await preview(config(root));
  return { server, origin: `https://localhost:${(server.httpServer.address() as AddressInfo).port}` };
}

interface H2Answer {
  /** The `1xx` that came before the response, in order. */
  readonly informational: IncomingHttpHeaders[];
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
}

/**
 * One HTTP/2 request. `onInformational` is told of each `1xx` as it arrives, before the response
 * — the one moment a test can tell a `103` that came early from one that came with the page.
 */
function h2(
  origin: string,
  path: string,
  headers: Readonly<Record<string, string>>,
  onInformational: (headers: IncomingHttpHeaders) => void = () => {},
): Promise<H2Answer> {
  return new Promise((resolve, reject) => {
    const session = connect(origin, { ca: CERT });
    session.on('error', reject);
    const informational: IncomingHttpHeaders[] = [];
    const stream = session.request({ ':path': path, ...headers });
    stream.on('headers', (h) => {
      informational.push(h);
      onInformational(h);
    });
    let response: IncomingHttpHeaders = {};
    stream.on('response', (h) => (response = h));
    stream.on('data', () => {});
    stream.on('end', () => {
      session.close();
      resolve({ informational, status: Number(response[':status']), headers: response });
    });
    stream.on('error', reject);
    stream.end();
  });
}

const NAVIGATE = { accept: 'text/html', 'sec-fetch-mode': 'navigate' };

describe('criteria 3–6: the middleware in the preview, over HTTP/2', () => {
  let server: PreviewServer;
  let origin: string;
  let manifest: { routes: { pattern: string; hints?: string[] }[]; errorHints?: string[] };

  beforeAll(async () => {
    ({ server, origin } = await served());
    globalThis.__fudicGate = Promise.resolve();
    manifest = JSON.parse(await fetchText(origin, '/fudic-routes.json')) as typeof manifest;
  }, 240000);

  afterAll(async () => {
    globalThis.__fudicGate = undefined;
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  });

  const routeHints = (pattern: string): string[] => manifest.routes.find((r) => r.pattern === pattern)!.hints!;

  it('criterion 3: the 103 of a navigation arrives before load is done, and the response says the same', async () => {
    let open!: () => void;
    globalThis.__fudicGate = new Promise<void>((resolve) => (open = resolve));
    let early: IncomingHttpHeaders | undefined;
    const answer = h2(origin, '/lento', NAVIGATE, (h) => {
      early = h;
      // Only now does `load` get to finish: the hints were out while it was waiting.
      open();
    });
    const { informational, status, headers } = await answer;
    expect(early?.[':status']).toBe(103);
    expect(informational).toHaveLength(1);
    const hints = routeHints('/lento');
    expect(hints[0]).toMatch(/^<\/assets\/site-[\w-]+\.css>; rel=preload; as=style$/u);
    expect(early!['link']).toBe(hints.join(', '));
    expect(status).toBe(200);
    expect(headers['link']).toBe(hints.join(', '));
    globalThis.__fudicGate = Promise.resolve();
  });

  it('criterion 4: a request that is no navigation gets no 103, and the Link all the same', async () => {
    const { informational, status, headers } = await h2(origin, '/lento', { accept: 'text/html' });
    expect(informational).toEqual([]);
    expect(status).toBe(200);
    expect(headers['link']).toBe(routeHints('/lento').join(', '));
  });

  it('criterion 4: over HTTP/1.1, no 103 either, and the Link', async () => {
    const { informational, link } = await https1(origin, '/lento');
    expect(informational).toEqual([]);
    expect(link).toBe(routeHints('/lento').join(', '));
  });

  it('criterion 5: a path with no route, the error page’s hints in the 103 and in its 404', async () => {
    const errorHints = manifest.errorHints!;
    expect(errorHints[0]).toMatch(/^<\/assets\/error-[\w-]+\.css>; rel=preload; as=style$/u);
    const { informational, status, headers } = await h2(origin, '/test', NAVIGATE);
    expect(informational.map((h) => h['link'])).toEqual([errorHints.join(', ')]);
    expect(status).toBe(404);
    expect(headers['link']).toBe(errorHints.join(', '));
  });

  it('criterion 5: load throws notFound — the 103 of the route, and the 404 says what it painted', async () => {
    const { informational, status, headers } = await h2(origin, '/missing', NAVIGATE);
    expect(informational.map((h) => h['link'])).toEqual([routeHints('/missing').join(', ')]);
    expect(status).toBe(404);
    expect(headers['link']).toBe(manifest.errorHints!.join(', '));
  });

  it('criterion 5: the error page’s own URL, with its hints', async () => {
    const { informational, status, headers } = await h2(origin, '/_fudic/error/401', NAVIGATE);
    expect(informational.map((h) => h['link'])).toEqual([manifest.errorHints!.join(', ')]);
    expect(status).toBe(401);
    expect(headers['link']).toBe(manifest.errorHints!.join(', '));
  });

  it('criterion 6: the data endpoint, a server function and a file carry neither', async () => {
    for (const path of ['/_fudic/data/lento', '/_fudic/fn/routes/lento/x', '/x.txt', '/fudic-routes.json']) {
      const { informational, headers } = await h2(origin, path, { 'sec-fetch-mode': 'navigate' });
      expect(informational, path).toEqual([]);
      expect(headers['link'], path).toBeUndefined();
    }
  });
});

describe('criterion 6: `earlyHints: false`', () => {
  let server: PreviewServer;
  let origin: string;

  beforeAll(async () => {
    ({ server, origin } = await served({ earlyHints: false }));
    globalThis.__fudicGate = Promise.resolve();
  }, 240000);

  afterAll(async () => {
    globalThis.__fudicGate = undefined;
    await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
  });

  it('no response carries a 103 or a Link: a page, the error page, a path with no route', async () => {
    for (const path of ['/lento', '/missing', '/test', '/_fudic/error/401']) {
      const { informational, headers } = await h2(origin, path, NAVIGATE);
      expect(informational, path).toEqual([]);
      expect(headers['link'], path).toBeUndefined();
    }
  });
});

describe('§4.1: the dev server with `server.https` is HTTP/2, and sends the 103 too', () => {
  /** A dev server of the project over HTTP/2, and its origin. */
  async function dev(fudicJson: Readonly<Record<string, unknown>>): Promise<{ server: ViteDevServer; origin: string }> {
    const server = await createServer({
      root: project(fudicJson),
      logLevel: 'silent',
      resolve: { alias: httpAlias },
      plugins: [fudic({ liveCheck: false })],
      server: { port: 0, https: { cert: CERT, key: KEY } },
    });
    await server.listen();
    return { server, origin: `https://localhost:${(server.httpServer!.address() as AddressInfo).port}` };
  }

  let on: { server: ViteDevServer; origin: string };
  let off: { server: ViteDevServer; origin: string };

  beforeAll(async () => {
    globalThis.__fudicGate = Promise.resolve();
    [on, off] = await Promise.all([dev({}), dev({ earlyHints: false })]);
  }, 120000);

  afterAll(async () => {
    globalThis.__fudicGate = undefined;
    await Promise.all([on.server.close(), off.server.close()]);
  });

  it('a page and the error page: the 103 and the Link, with the dev server’s URLs', async () => {
    for (const path of ['/lento', '/missing', '/test', '/_fudic/error/401']) {
      const { informational, headers } = await h2(on.origin, path, NAVIGATE);
      expect(informational.map((h) => h[':status']), path).toEqual([103]);
      expect(headers['link'], path).toContain('</fudic-main.js>; rel=modulepreload');
    }
    const { headers } = await h2(on.origin, '/lento', NAVIGATE);
    expect(headers['link']).toMatch(/^<[^>]*site[^>]*\.css>; rel=preload; as=style, /u);
  });

  it('`earlyHints: false`: neither', async () => {
    for (const path of ['/lento', '/missing', '/test']) {
      const { informational, headers } = await h2(off.origin, path, NAVIGATE);
      expect(informational, path).toEqual([]);
      expect(headers['link'], path).toBeUndefined();
    }
  });
});

/** A GET over HTTP/2 whose body is the answer, for the manifest. */
function fetchText(origin: string, path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const session = connect(origin, { ca: CERT });
    const stream = session.request({ ':path': path });
    let body = '';
    stream.on('data', (c: Buffer) => (body += c.toString()));
    stream.on('end', () => {
      session.close();
      resolve(body);
    });
    stream.on('error', reject);
    stream.end();
  });
}

/** A navigation over HTTP/1.1, with every `1xx` it was sent and the `Link` of its response. */
function https1(origin: string, path: string): Promise<{ informational: number[]; link: string | undefined }> {
  return new Promise((resolve, reject) => {
    const informational: number[] = [];
    const req = httpsRequest(`${origin}${path}`, { ca: CERT, headers: NAVIGATE }, (res) => {
      res.resume();
      res.on('end', () => resolve({ informational, link: res.headers['link'] as string | undefined }));
    });
    req.on('information', (info) => informational.push(info.statusCode));
    req.on('error', reject);
    req.end();
  });
}
