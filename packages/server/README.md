# @fudic/server

Serves a fudic app from a `Request` to a `Response`: pages, their data, the redirect to a
locale, `_error.fud`, the headers of `page.headers` with their nonce, the `103`, functions, remote rules and the CSRF
token. The same code answers in dev, in `vite preview` and behind any adapter (SDD-81). Its main
entry needs only `Request`, `Response` and `crypto`: Node, Deno, Bun or the edge.

```ts
import { createServer } from '@fudic/server';
import { config, createApp } from './.fudic/edge/server.mjs';

const server = createServer(createApp({ prerendered: (pathname) => myPages.get(pathname) }), config);
const response = await server.fetch(request);   // null: not the app's (a static file)
```

- `createApp(io)` of the build's `server.mjs` is the app; `io.prerendered(pathname)` gives the
  HTML of a prerendered page, or `null`. `config` is what `fudic.json` says under `serve`.
- `fetch(request, hooks?)` answers, or `null` for what the host serves itself. `hooks.earlyHints`
  is called once, before the answer, with what a `103` may say.
- `notFound(request)` paints `_error.fud` as a `404` for a navigation nothing answered: the host
  calls it after its own files. `staticHeaders(request)` gives the headers of a static file: the rule of `assets.headers` that
  wins for each name (`''` = remove the host's), and for the manifest and the worker the headers of
  fudic (`no-cache`, and `sw.headers` on the worker), whatever `assets.headers` says (SDD-84).

Options of `createServer`:

| Option | |
|---|---|
| `secureCookies` | Whether a cookie goes `Secure` unless it says (default `true`). Never decided by the `Host` |
| `trustProxy` | Read `Forwarded`, else `X-Forwarded-Proto` / `-Host`, for the public URL. Only behind a proxy you trust |
| `secret` | Signs the CSRF token of `use csrf` with `token true`. Without one, dev and preview sign with one of their own; anything else answers that call `500` |
| `uploads` | `maxFileSize`, `maxFiles`, `maxArgs` |
| `spool` | Where an upload waits while its handler runs: memory by default |
| `dev`, `onError`, `prepare`, `transformHtml` | What the dev server hooks in |

## On Node

`@fudic/server/node` is the glue to `node:http`: `toRequest`, `sendResponse` (streams the body
and stops it when the client goes), `nodeMiddleware(server, { notFound })` (the static headers,
the `103` over HTTP/2, `fetch`, then `next`), `staticPages(dir)` (the prerendered pages of the
build), `staticFiles(dir)` (the rest of the build's files, for `next`) and `diskSpool()` (each
upload in a temporary file, read back by `fs.openAsBlob`, gone once the response is done).

```js
import { createServer as listen } from 'node:http';
import { createServer } from '@fudic/server';
import { diskSpool, nodeMiddleware, staticFiles, staticPages } from '@fudic/server/node';
import { config, createApp } from './.fudic/edge/server.mjs';

const serve = nodeMiddleware(createServer(createApp({ prerendered: staticPages('dist') }), { ...config, spool: diskSpool, secret: process.env.FUDIC_SECRET }), { notFound: true });
const files = staticFiles('dist');
listen((req, res) => serve(req, res, () => files(req, res, () => res.writeHead(404).end()))).listen(3000);
```

`examples/basic/node-server.mjs` is this, running the example.

## Scripts

```sh
pnpm --filter @fudic/server test
pnpm --filter @fudic/server typecheck
pnpm --filter @fudic/server coverage
```
