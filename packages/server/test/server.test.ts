/**
 * `createServer` (SDD-81 §3.10, criteria 40 and 42): what a fudic app answers, from a `Request`,
 * with a test `ServerApp`. The order of `fetch` is the order of these blocks.
 */

import { describe, expect, it, vi } from 'vitest';
import { NONCE_TOKEN } from '@fudic/transport';
import { createServer, matchRoute, type EarlyHints, type FunctionsOptions, type RenderModule } from '../src/index.js';
import { errorModule, failing, httpError, navigate, pageModule, redirect, streamOf, testApp } from './helpers.js';

const CSP = "script-src 'nonce-{nonce}'";

/** The nonce a CSP header names. */
const nonceOf = (csp: string | null): string => /'nonce-([^']+)'/u.exec(csp ?? '')?.[1] ?? '';

describe('functions, remote rules and the CSRF token (step 2)', () => {
  const answering = vi.fn<(options: FunctionsOptions) => (request: Request) => Promise<Response | null>>(
    () => async (request) => new Response(`fn ${new URL(request.url).pathname} ${request.method}`),
  );

  it('go to the server root’s handler, whatever the method', async () => {
    const server = createServer(testApp({ functions: answering }));
    for (const [path, method] of [
      ['/_fudic/fn/routes/a/save', 'POST'],
      ['/_fudic/rule/rules/p/alias-taken', 'POST'],
      ['/_fudic/csrf', 'GET'],
    ] as const) {
      const response = await server.fetch(new Request(`http://app.test${path}`, { method }));
      expect(await response!.text()).toBe(`fn ${path} ${method}`);
    }
  });

  it('under base, and only there', async () => {
    const server = createServer(testApp({ base: '/app/', functions: answering }));
    expect(await (await server.fetch(new Request('http://app.test/app/_fudic/csrf')))!.text()).toBe('fn /app/_fudic/csrf GET');
    // Outside base it is no function: a GET that matches no route.
    expect(await server.fetch(new Request('http://app.test/_fudic/csrf'))).toBeNull();
    expect(await server.fetch(new Request('http://app.test/app/_fudic/csrf/x'))).toBeNull();
  });

  it('the factory is told the server’s options once, production’s by default', () => {
    answering.mockClear();
    createServer(testApp({ functions: answering }));
    expect(answering).toHaveBeenCalledOnce();
    expect(answering.mock.calls[0]![0]).toEqual({ base: '/', dev: false, secureCookies: true });
  });

  it('and every option it was given', () => {
    answering.mockClear();
    const onError = (): void => undefined;
    const spool = (): never => expect.unreachable();
    createServer(testApp({ functions: answering }), {
      secureCookies: false,
      secret: 's3cret',
      onError,
      uploads: { maxFiles: 2 },
      spool,
    });
    expect(answering.mock.calls[0]![0]).toEqual({
      base: '/',
      dev: false,
      secureCookies: false,
      secret: 's3cret',
      onError,
      uploads: { maxFiles: 2 },
      spool,
    });
  });

  it('dev without a secret signs with a random one per server; production has none', () => {
    answering.mockClear();
    createServer(testApp({ functions: answering }), { dev: true });
    createServer(testApp({ functions: answering }), { dev: true });
    const [one, two] = answering.mock.calls.map(([options]) => options.secret);
    expect(one).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(two).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(one).not.toBe(two);
    expect(answering.mock.calls[0]![0].dev).toBe(true);
  });

  it('an app without functions answers a function URL with a 404 problem', async () => {
    const response = await createServer(testApp()).fetch(new Request('http://app.test/_fudic/fn/x', { method: 'POST' }));
    expect(response!.status).toBe(404);
    expect(response!.headers.get('content-type')).toBe('application/problem+json');
    expect(await response!.json()).toEqual({ status: 404, title: 'Not Found', detail: 'no such server function' });
  });
});

describe('only GET and HEAD go on (step 3)', () => {
  it('a POST to a page is not the app’s', async () => {
    const server = createServer(testApp({ routes: [{ pattern: '/', module: pageModule() }] }));
    expect(await server.fetch(new Request('http://app.test/', { method: 'POST' }))).toBeNull();
  });

  it('a HEAD is served', async () => {
    const server = createServer(testApp({ routes: [{ pattern: '/', module: pageModule() }] }));
    expect((await server.fetch(new Request('http://app.test/', { method: 'HEAD' })))!.status).toBe(200);
  });
});

describe('the locale redirect (step 4)', () => {
  const app = testApp({
    locales: ['es', 'en'],
    routes: [
      { pattern: '/es/about', module: pageModule() },
      { pattern: '/en/about', module: pageModule() },
      { pattern: '/es', module: pageModule() },
      { pattern: '/en', module: pageModule() },
    ],
  });

  it('a page asked without its prefix: 302 to the language that fits, varying by Accept-Language', async () => {
    const response = await createServer(app).fetch(navigate('/about', { 'accept-language': 'en-GB,en;q=0.8' }));
    expect(response!.status).toBe(302);
    expect(response!.headers.get('location')).toBe('/en/about');
    expect(response!.headers.get('vary')).toBe('Accept-Language');
  });

  it('under base, and `/` too', async () => {
    const server = createServer({ ...app, base: '/app/' });
    expect((await server.fetch(navigate('/app/')))!.headers.get('location')).toBe('/app/es/');
  });

  it('a URL with its prefix, or one that is no page, is left alone', async () => {
    const server = createServer(app);
    expect((await server.fetch(navigate('/en/about')))!.status).toBe(200);
    expect(await server.fetch(navigate('/nope'))).toBeNull();
  });
});

describe('the data endpoint (step 5)', () => {
  const data = (frames: () => Promise<ReadableStream<Uint8Array>>, write: (ctx: Parameters<NonNullable<RenderModule['data']>>[0]) => void = () => undefined): RenderModule => ({
    render: () => streamOf(''),
    data: async (ctx) => {
      write(ctx);
      return frames();
    },
  });

  it('its frames, with what load wrote', async () => {
    const mod = data(
      async () => streamOf('frame'),
      (ctx) => {
        ctx.response!.status = 203;
        ctx.response!.headers.set('x-load', 'yes');
      },
    );
    const response = await createServer(testApp({ routes: [{ pattern: '/a/:id', module: mod }] })).fetch(new Request('http://app.test/_fudic/data/a/7'));
    expect(response!.status).toBe(203);
    expect(response!.headers.get('content-type')).toBe('application/fud+frames');
    expect(response!.headers.get('x-load')).toBe('yes');
    expect(await response!.text()).toBe('frame');
  });

  it('of `/`, under base', async () => {
    const seen: string[] = [];
    const mod = data(async () => streamOf(''), (ctx) => seen.push(ctx.url.pathname));
    await createServer(testApp({ base: '/app/', routes: [{ pattern: '/', module: mod }] })).fetch(new Request('http://app.test/app/_fudic/data'));
    expect(seen).toEqual(['/']);
  });

  it('none for a route that resolves nothing, no route, or one that does not render', async () => {
    const server = createServer(testApp({ routes: [{ pattern: '/plain', module: pageModule() }, { pattern: '/static' }] }));
    expect((await server.fetch(new Request('http://app.test/_fudic/data/plain')))!.status).toBe(404);
    expect(await server.fetch(new Request('http://app.test/_fudic/data/nope'))).toBeNull();
    expect(await server.fetch(new Request('http://app.test/_fudic/data/static'))).toBeNull();
  });

  it('a failure of load: its problem in JSON, a redirect with its location, the unexpected told', async () => {
    const onError = vi.fn();
    const failingWith = (error: unknown): RenderModule => data(async () => Promise.reject(error));
    const server = (error: unknown, dev = false) =>
      createServer(testApp({ routes: [{ pattern: '/a', module: failingWith(error) }] }), { onError, dev });
    const ask = async (error: unknown, dev = false) => (await server(error, dev).fetch(new Request('http://app.test/_fudic/data/a')))!;

    const gone = await ask(httpError(410, 'Gone', 'it went'));
    expect(gone.status).toBe(410);
    expect(gone.headers.get('content-type')).toBe('application/problem+json');
    expect(await gone.json()).toEqual({ status: 410, title: 'Gone', detail: 'it went' });

    const moved = await ask(redirect('/login'));
    expect(await moved.json()).toEqual({ status: 303, title: 'Redirect', location: '/login' });
    expect(onError).not.toHaveBeenCalled();

    const boom = await ask(new Error('boom'), true);
    expect(await boom.json()).toEqual({ status: 500, title: 'Internal Server Error', detail: 'boom' });
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('_error.fud at its own URL (step 7)', () => {
  it('painted with the status alone, and where the call came from', async () => {
    const server = createServer(testApp({ errorPages: { '': errorModule() } }));
    const response = await server.fetch(navigate('/_fudic/error/404?title=<b>x</b>', { referer: 'http://app.test/usuarios?p=2' }));
    expect(response!.status).toBe(404);
    expect(response!.headers.get('content-type')).toBe('text/html; charset=utf-8');
    const text = await response!.text();
    expect(text).toContain('"status":404,"title":"Not Found","path":"/usuarios","back":"/usuarios?p=2"');
    expect(text).not.toContain('<b>');
  });

  it('a status that is not an error’s is no page', async () => {
    const server = createServer(testApp());
    for (const status of ['abc', '200', '600', '4.5']) expect(await server.fetch(navigate(`/_fudic/error/${status}`))).toBeNull();
  });

  it('in the locale of its prefix, else of the page it comes from', async () => {
    const server = createServer(
      testApp({ locales: ['es', 'en'], errorPages: { en: errorModule(), es: { module: { render: () => streamOf('<p>es</p>') }, hints: [] } } }),
    );
    expect(await (await server.fetch(navigate('/en/_fudic/error/500')))!.text()).toContain('"status":500');
    expect(await (await server.fetch(navigate('/_fudic/error/500', { referer: 'http://app.test/es/about' })))!.text()).toBe('<p>es</p>');
    // No prefix and no page to read one from: none, and this app has no page for none.
    expect(await (await server.fetch(navigate('/_fudic/error/500', { referer: '::not a url' })))!.text()).toContain('<h1>500</h1>');
  });

  it('without _error.fud, the minimal page, with the page policies', async () => {
    const response = await createServer(testApp({ csp: CSP })).fetch(navigate('/_fudic/error/503'));
    expect(await response!.text()).toContain('<title>503 Service Unavailable</title>');
    expect(response!.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response!.headers.get('content-security-policy')).toMatch(/^script-src 'nonce-[^']+'$/u);
  });
});

describe('a route (step 8)', () => {
  it('its prerendered HTML, with a fresh nonce in the page and in the CSP, and its Link', async () => {
    const app = testApp({
      csp: CSP,
      routes: [{ pattern: '/about', prerendered: `<script nonce="${NONCE_TOKEN}"></script>`, hints: ['</a.css>; rel=preload; as=style'] }],
    });
    const server = createServer(app);
    const first = await server.fetch(navigate('/about'));
    const second = await server.fetch(navigate('/about'));
    const nonce = nonceOf(first!.headers.get('content-security-policy'));
    expect(await first!.text()).toBe(`<script nonce="${nonce}"></script>`);
    expect(nonce).not.toBe(nonceOf(second!.headers.get('content-security-policy')));
    expect(first!.headers.get('link')).toBe('</a.css>; rel=preload; as=style');
    expect(first!.headers.get('content-type')).toBe('text/html; charset=utf-8');
  });

  it('in the workbench’s own build, a criterion’s request is painted on demand, never prerendered (SDD-82 §4.2, §4.7)', async () => {
    const key = Symbol.for('fudic.bench');
    const hooks = { criterionOf: (request: Request) => (request.headers.get('cookie') === 'fudic-bench=r-1.c' ? 'r-1.c' : undefined) };
    (globalThis as Record<symbol, unknown>)[key] = hooks;
    try {
      const routes = [
        { pattern: '/about', prerendered: '<p>prerendered</p>', module: pageModule() },
        // A route the build only prerendered has nothing else to serve: its file, criterion or not.
        { pattern: '/static', prerendered: '<p>static</p>' },
      ];
      const benched = createServer(testApp({ routes }), { bench: true });
      const criterion = { cookie: 'fudic-bench=r-1.c' };
      expect(await (await benched.fetch(navigate('/about', criterion)))!.text()).toContain('http://app.test/about');
      expect(await (await benched.fetch(navigate('/about')))!.text()).toBe('<p>prerendered</p>');
      expect(await (await benched.fetch(navigate('/static', criterion)))!.text()).toBe('<p>static</p>');
      // Any other build ignores the cookie.
      expect(await (await createServer(testApp({ routes })).fetch(navigate('/about', criterion)))!.text()).toBe('<p>prerendered</p>');
    } finally {
      delete (globalThis as Record<symbol, unknown>)[key];
    }
  });

  it('the workbench’s own build tells its functions so; any other build does not', async () => {
    const seen: (boolean | undefined)[] = [];
    const functions = (options: FunctionsOptions) => {
      seen.push(options.bench);
      return async () => null;
    };
    createServer(testApp({ functions }), { bench: true });
    createServer(testApp({ functions }));
    expect(seen).toEqual([true, undefined]);
  });

  it('a route with no page and nothing to render it with is not the app’s; no route neither', async () => {
    const server = createServer(testApp({ routes: [{ pattern: '/blog' }] }));
    expect(await server.fetch(navigate('/blog'))).toBeNull();
    expect(await server.fetch(navigate('/nope'))).toBeNull();
  });

  it('rendered as it comes: the head first, the rest behind it, the nonce of the CSP', async () => {
    const server = createServer(testApp({ csp: CSP, routes: [{ pattern: '/blog/:slug', module: pageModule() }] }));
    const response = await server.fetch(navigate('/blog/hola?x=1'));
    const html = await response!.text();
    const nonce = nonceOf(response!.headers.get('content-security-policy'));
    // The render's URL is the path, as before SDD-81: `load` reads the query from `ctx.request`.
    expect(html).toBe(`<html><head><title>/blog/hola</title></head><body nonce="${nonce}">http://app.test/blog/hola</body></html>`);
  });

  it('what load wrote goes out, and fudic’s own headers win over it', async () => {
    const mod = pageModule((ctx) => {
      ctx.response!.status = 201;
      ctx.response!.headers.append('set-cookie', 'a=1');
      ctx.response!.headers.set('content-security-policy', 'mine');
      ctx.response!.headers.set('referrer-policy', 'no-referrer');
    });
    const withCsp = await createServer(testApp({ csp: CSP, routes: [{ pattern: '/', module: mod }] })).fetch(navigate('/'));
    expect(withCsp!.status).toBe(201);
    expect(withCsp!.headers.getSetCookie()).toEqual(['a=1']);
    expect(withCsp!.headers.get('content-security-policy')).toMatch(/^script-src 'nonce-/u);
    expect(withCsp!.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    // Dev has no CSP, and neither does what load wrote.
    const dev = await createServer(testApp({ routes: [{ pattern: '/', module: mod }] })).fetch(navigate('/'));
    expect(dev!.headers.has('content-security-policy')).toBe(false);
    expect(dev!.headers.has('link')).toBe(false);
  });

  it('a page that shows no </head> goes out whole, through transformHtml', async () => {
    const transformHtml = vi.fn(async (url: string, html: string, whole: boolean) => `${html}<!-- ${url} ${String(whole)} -->`);
    const mod: RenderModule = { render: () => streamOf('<p>', 'no head</p>') };
    const response = await createServer(testApp({ routes: [{ pattern: '/x', module: mod }] }), { transformHtml }).fetch(navigate('/x?q=1'));
    expect(await response!.text()).toBe('<p>no head</p><!-- /x?q=1 true -->');
  });

  it('streamed, only the head goes through transformHtml', async () => {
    const transformHtml = vi.fn(async (_url: string, html: string) => html.replace('</head>', '<script>vite</script></head>'));
    const server = createServer(testApp({ base: '/app/', routes: [{ pattern: '/', module: pageModule() }] }), { transformHtml });
    const text = await (await server.fetch(navigate('/app/')))!.text();
    expect(text).toContain('<script>vite</script></head><body');
    expect(transformHtml).toHaveBeenCalledWith('/', expect.stringMatching(/<\/head>$/u), false);
  });

  it('an error after the first byte is only told: the page ends there', async () => {
    const onError = vi.fn();
    const late = new Error('late');
    const mod: RenderModule = {
      render: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<html><head></head><body>'));
          },
          pull(controller) {
            controller.error(late);
          },
        }),
    };
    const response = await createServer(testApp({ routes: [{ pattern: '/', module: mod }] }), { onError }).fetch(navigate('/'));
    expect(response!.status).toBe(200);
    expect(await response!.text()).toBe('<html><head></head><body>');
    expect(onError).toHaveBeenCalledWith(late);
  });

  it('a browser that goes away stops the render', async () => {
    const cancelled = vi.fn();
    const mod: RenderModule = {
      render: () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('<html><head></head>'));
          },
          cancel: cancelled,
        }),
    };
    const response = await createServer(testApp({ routes: [{ pattern: '/', module: mod }] })).fetch(navigate('/'));
    await response!.body!.cancel();
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('prepare runs before the page, and its throw is fetch’s rejection', async () => {
    const prepare = vi.fn(async (route: { pattern: string }) => {
      if (route.pattern === '/bad') throw new Error('graph has errors');
    });
    const server = createServer(testApp({ routes: [{ pattern: '/bad', module: pageModule() }, { pattern: '/ok', module: pageModule() }] }), { prepare });
    await expect(server.fetch(navigate('/bad'))).rejects.toThrow('graph has errors');
    expect((await server.fetch(navigate('/ok')))!.status).toBe(200);
  });
});

describe('a failure of load or layout', () => {
  it('a Redirect: its status and Location, with what load wrote', async () => {
    const mod: RenderModule = {
      render: (ctx) => {
        ctx.response!.headers.append('set-cookie', 'gone=1');
        return failing(redirect('/entrar'));
      },
    };
    const response = await createServer(testApp({ routes: [{ pattern: '/', module: mod }] })).fetch(navigate('/'));
    expect(response!.status).toBe(303);
    expect(response!.headers.get('location')).toBe('/entrar');
    expect(response!.headers.getSetCookie()).toEqual(['gone=1']);
  });

  it('an HttpError: _error.fud of the page’s locale with its status, what load wrote, one 103', async () => {
    const hints = vi.fn<(h: EarlyHints) => void>();
    const mod: RenderModule = {
      render: (ctx) => {
        ctx.response!.headers.set('x-load', 'wrote');
        return failing(httpError(503, 'Service Unavailable', 'db down'));
      },
    };
    const app = testApp({
      locales: ['es', 'en'],
      routes: [{ pattern: '/en/x', module: mod, hints: ['</x.css>'] }],
      errorPages: { en: errorModule(['</e.css>']) },
    });
    const response = await createServer(app).fetch(navigate('/en/x'), { earlyHints: hints });
    expect(response!.status).toBe(503);
    expect(response!.headers.get('x-load')).toBe('wrote');
    expect(await response!.text()).toContain('"status":503,"title":"Service Unavailable","detail":"db down","path":"/en/x"');
    // The route's 103 went before load ran; the error page does not send a second.
    expect(hints).toHaveBeenCalledOnce();
    expect(hints.mock.calls[0]![0].link).toEqual(['</x.css>']);
    // The final response names what it painted.
    expect(response!.headers.get('link')).toBe('</e.css>');
  });

  it('anything else: a 500, told to onError; its message only in dev', async () => {
    const onError = vi.fn();
    const mod: RenderModule = { render: () => failing(new Error('secret detail')) };
    const prod = await createServer(testApp({ routes: [{ pattern: '/', module: mod }], errorPages: { '': errorModule() } }), { onError }).fetch(navigate('/'));
    expect(prod!.status).toBe(500);
    expect(await prod!.text()).not.toContain('secret detail');
    expect(onError).toHaveBeenCalledOnce();
    const dev = await createServer(testApp({ routes: [{ pattern: '/', module: mod }], errorPages: { '': errorModule() } }), { dev: true }).fetch(navigate('/'));
    expect(await dev!.text()).toContain('secret detail');
  });
});

describe('the 103 (criterion 42)', () => {
  it('a route gives its Link and the CSP with the nonce the page carries', async () => {
    const hints = vi.fn<(h: EarlyHints) => void>();
    const server = createServer(testApp({ csp: CSP, routes: [{ pattern: '/', module: pageModule(), hints: ['</a.js>; rel=modulepreload'] }] }));
    const response = await server.fetch(navigate('/'), { earlyHints: hints });
    const html = await response!.text();
    expect(hints).toHaveBeenCalledOnce();
    const sent = hints.mock.calls[0]![0];
    expect(sent.link).toEqual(['</a.js>; rel=modulepreload']);
    expect(sent['referrer-policy']).toBe('strict-origin-when-cross-origin');
    const nonce = nonceOf(sent['content-security-policy']!);
    expect(html).toContain(`nonce="${nonce}"`);
    expect(response!.headers.get('content-security-policy')).toBe(sent['content-security-policy']);
  });

  it('for a prerendered page too, and without a CSP in dev', async () => {
    const hints = vi.fn<(h: EarlyHints) => void>();
    await createServer(testApp({ routes: [{ pattern: '/', prerendered: '<p></p>', hints: ['</a.css>'] }] })).fetch(navigate('/'), { earlyHints: hints });
    expect(hints.mock.calls[0]![0]).toEqual({ link: ['</a.css>'], 'referrer-policy': 'strict-origin-when-cross-origin' });
  });

  it('nothing to hint, or nobody to tell: no call', async () => {
    const hints = vi.fn();
    const server = createServer(testApp({ routes: [{ pattern: '/', module: pageModule() }, { pattern: '/h', module: pageModule(), hints: ['</a>'] }] }));
    await server.fetch(navigate('/'), { earlyHints: hints });
    expect(hints).not.toHaveBeenCalled();
    expect((await server.fetch(navigate('/h'), {}))!.status).toBe(200);
  });
});

describe('notFound (criterion 42)', () => {
  it('paints _error.fud as a 404, in the locale of the URL, with its 103', async () => {
    const hints = vi.fn();
    const server = createServer(testApp({ base: '/app/', locales: ['es', 'en'], errorPages: { en: errorModule(['</e.css>']) } }));
    const response = await server.notFound(navigate('/app/en/nada?x=1'), { earlyHints: hints });
    expect(response!.status).toBe(404);
    expect(await response!.text()).toContain('"status":404,"title":"Not Found","path":"/en/nada"');
    expect(hints).toHaveBeenCalledOnce();
  });

  it('only for a GET or HEAD that asks for HTML', async () => {
    const server = createServer(testApp());
    expect(await server.notFound(new Request('http://app.test/x', { method: 'POST', headers: { accept: 'text/html' } }))).toBeNull();
    expect(await server.notFound(new Request('http://app.test/x.png'))).toBeNull();
    expect(await server.notFound(new Request('http://app.test/x.png', { headers: { accept: 'image/*' } }))).toBeNull();
    expect((await server.notFound(navigate('/x')))!.status).toBe(404);
  });

  it('behind a trusted proxy, the public URL', async () => {
    const server = createServer(testApp({ errorPages: { '': errorModule() } }), { trustProxy: true });
    const response = await server.notFound(navigate('/x', { 'x-forwarded-proto': 'https', referer: 'https://app.test/back' }));
    // The way back is of the public origin: the Referer is https and so is the request now.
    expect(await response!.text()).toContain('"back":"/back"');
  });
});

describe('fetch returns null for a static file (criterion 42)', () => {
  it('a file no route matches is the host’s', async () => {
    const server = createServer(testApp({ routes: [{ pattern: '/', module: pageModule() }] }));
    expect(await server.fetch(new Request('http://app.test/assets/app.js'))).toBeNull();
    expect(await server.fetch(navigate('/favicon.ico'))).toBeNull();
  });

  it('and staticHeaders gives the extra headers of the app’s own, by path without base', () => {
    const server = createServer(testApp({ base: '/app/', statics: { '/sw.js': { 'cache-control': 'no-cache' } } }));
    expect(server.staticHeaders(new Request('http://app.test/app/sw.js'))).toEqual({ 'cache-control': 'no-cache' });
    expect(server.staticHeaders(new Request('http://app.test/app/other.js'))).toBeNull();
    // A path outside base is matched as it is.
    expect(server.staticHeaders(new Request('http://app.test/sw.js'))).toEqual({ 'cache-control': 'no-cache' });
    expect(createServer(testApp()).staticHeaders(new Request('http://app.test/sw.js'))).toBeNull();
  });
});

describe('trustProxy (step 1, criterion 45)', () => {
  const echo = () => async (request: Request) => new Response(request.url);

  it('with it, everything after sees the public URL', async () => {
    const server = createServer(testApp({ functions: echo, routes: [{ pattern: '/', module: pageModule() }] }), { trustProxy: true });
    const headers = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.example' };
    expect(await (await server.fetch(new Request('http://localhost:3000/_fudic/fn/x', { method: 'POST', headers })))!.text()).toBe(
      'https://app.example/_fudic/fn/x',
    );
    expect(await (await server.fetch(navigate('http://localhost:3000/', headers)))!.text()).toContain('https://app.example/</body>');
  });

  it('without it, the headers change nothing', async () => {
    const server = createServer(testApp({ functions: echo }));
    const response = await server.fetch(new Request('http://localhost:3000/_fudic/fn/x', { method: 'POST', headers: { 'x-forwarded-proto': 'https' } }));
    expect(await response!.text()).toBe('http://localhost:3000/_fudic/fn/x');
  });
});

describe('matchRoute', () => {
  it('the first route whose pattern matches: the list is most specific first', () => {
    const routes = testApp({ routes: [{ pattern: '/blog/new' }, { pattern: '/blog/:slug' }] }).routes();
    expect(matchRoute(routes, '/blog/new')?.pattern).toBe('/blog/new');
    expect(matchRoute(routes, '/blog/hola')?.pattern).toBe('/blog/:slug');
    expect(matchRoute(routes, '/blog')).toBeNull();
  });
});
