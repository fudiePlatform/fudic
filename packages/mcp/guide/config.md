# config

The files a project declares itself with: `fudic.json`, `sw.json`, and the three `.headers` of an
app — `page.headers`, `sw.headers` and `assets.headers`. What each key does, what it takes, what it
is when it is not written, and what to do with each diagnostic of the headers.

## fudic.json

At the root of every app and library. Every key is optional; a key fudic does not know is
`FUD0725`, and so is a value of the wrong shape.

| Key | Takes | When absent | What it is for |
|---|---|---|---|
| `id` | lowercase, may contain hyphens | `""` | The identity of the app: it names the Service Worker's caches. Required with a `sw.json`. **Never change it** once the app has been visited. |
| `kind` | `"app"` or `"lib"` | `"app"` | An app is served; a library is used by other projects and is never served. |
| `prefix` | lowercase, may contain hyphens | `""` | What new components are named with: `card` becomes `<app-card>` with `"prefix": "app"`. It proposes, it does not forbid. |
| `globalStyles` | `{ "name": "path.css" }` | `{}` | The sheets every component of the project adopts, in this order, before its own. |
| `styles` | `{ "name": "path.css" }` | `{}` | The sheets a component may adopt by name in the `shadowrootadoptedstylesheets` of its root template. |
| `locales` | BCP 47 tags, at least one | `["en"]` | The languages of the app; the first is the one the code is written in. See `pages`. |
| `site` | an origin, `https://example.com` | none | Where the app is published: the absolute URLs of `canonical` and `hreflang`. |
| `server` | a folder of the project | `"src/server"` | Where the handlers of the `.fudapi` live: code that only runs on the server. |
| `browser` | a folder of the project | `"src/browser"` | Where the code that runs in the browser lives. |
| `pipes` | a folder of the project | `"src/pipes"` | Where the pipes live: their `.fudapi` and their implementation. |
| `api` | a folder of the library | `"fudapi"` | A library's `.fudapi` folder. Only in a library. |
| `earlyHints` | `true` or `false` | `true` | Whether each route's `103 Early Hints` are written and sent. |
| `css` | `"inline"` or `"link"` | `"inline"` | Where a page's CSS lives: inside the page, or a file per sheet, hinted before it. |
| `guide` | `{ "sheet": "…", "icon": "…" }` | none | The style guide the project carries: `sheet` is its entry sheet, `icon` the favicon of its pages. See `html-css`. |
| `serve` | `{ "trustProxy": …, "uploads": … }` | none | How the app is served. `trustProxy`: the server believes the `X-Forwarded-*` of the proxy in front. `uploads`: `maxFileSize` (10 MB), `maxFiles` (20), `maxArgs` (1 MB), as bytes or `"50mb"`. |
| `diagnostics` | `{ "FUDnnnn": level, "warnings": level }` | `{}` | How the project reports each code: `off`, `hint`, `info`, `warning` or `error`; `warnings` sets every code that is a warning by default. An error is never lowered. See `overview`. |
| `baseline` | `"widely"`, `"newly"`, a year, or `{ "target": …, "allow": [ids] }` | `"widely"` | The browsers of the users: what is newer than `target` is `FUD1524`. `allow` lists the web-features ids used knowingly. See `overview`. |

```json path=fudic.json
{
  "id": "shop",
  "kind": "app",
  "prefix": "shop",
  "server": "src/server",
  "browser": "src/browser",
  "site": "https://shop.example.com",
  "serve": { "trustProxy": true, "uploads": { "maxFileSize": "50mb" } },
  "diagnostics": { "FUD1547": "error" },
  "baseline": "widely"
}
```

## sw.json

At the root of an app: what its Service Worker caches. **No `sw.json`, no Service Worker**: delete it
and the app is served without one. Its fields:

- `shell`: the exact URLs precached on install, served by identity. `[]` is valid.
- `resources`: classes of resources by name, each with:
  - `pattern`: the URLs of the class, without the base; `*` within a segment, `**` across them.
  - `policy`: one of the four — `cache-first` (the cache, the network when missing), `network-first`
    (the network, the cache when offline), `stale-while-revalidate` (the cache now, refreshed
    behind), `network-only` (never cached).
  - `ttl`: how long an entry lives: `30s`, `5m`, `2h`, `7d`, or `null` for no limit.
  - `maxEntries`: the most entries the class keeps.
- `dev`: `"off"` (the default: no Service Worker under `vite dev`) or `"preview"`.

The cache key is the URL alone: a response that varies by a request header carries it in the URL.

```json path=sw.json
{
  "shell": [],
  "resources": {
    "assets": { "pattern": "/assets/**", "policy": "cache-first", "ttl": null, "maxEntries": 200 },
    "images": { "pattern": "/img/**", "policy": "stale-while-revalidate", "ttl": "7d" }
  },
  "dev": "off"
}
```

## The headers: page.headers, sw.headers, assets.headers

Three text files at the root of an app, one per thing they govern. **What is in the file is what is
sent**: fudic adds nothing hidden, only the headers that are its own. A missing file is read as its
template, which is what `fudic new` writes.

| File | Goes on |
|---|---|
| `page.headers` | Every page and every `_error`, painted by the server or by the Service Worker. Its `103` carries only the CSP and the `Referrer-Policy`. |
| `sw.headers` | `/fudic-sw.js`. Only with a `sw.json`. |
| `assets.headers` | The app's static files, by path. |

The syntax:

```text
# A comment: from # to the end of the line, alone on its line.
Content-Security-Policy:
  default-src 'self'
  script-src 'nonce-{nonce}' 'strict-dynamic'
Referrer-Policy: strict-origin-when-cross-origin
X-Custom: anything
```

- One header per line, `Name: value`, the name at column 0. Names are not case sensitive.
- An indented line continues the header above, joined with `; ` in the CSP (a directive per line)
  and with `, ` in `Cache-Control`, `Permissions-Policy` and `Reporting-Endpoints`.
- `{nonce}` is the nonce of each response, and only goes in `page.headers` as `'nonce-{nonce}'`.
  Without it there is no nonce: the server does not make one and the HTML carries none.
- `# fud-disable-next-line FUD1547: why` silences a warning on the next line, as in any file.

`assets.headers` opens a block per path, its headers indented below:

```text path=assets.headers
/**
  Cache-Control: no-cache

/assets/**
  Cache-Control: public, max-age=31536000, immutable

/legacy.js
  Cache-Control:
```

- Paths without the base; `*` within a segment, `**` across segments.
- **The most specific path wins, header by header**: a path without wildcards beats any pattern;
  between patterns, the one with more literal characters; on a tie, the first one.
- An empty value sends nothing to the files of that block.

The template of `page.headers` is the strict CSP Lighthouse asks for:

```text path=page.headers
Content-Security-Policy:
  default-src 'self'
  script-src 'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline' https:
  style-src 'self' 'unsafe-inline'
  img-src 'self' data:
  object-src 'none'
  base-uri 'none'
  frame-ancestors 'none'
  require-trusted-types-for 'script'
  trusted-types fudic
Referrer-Policy: strict-origin-when-cross-origin
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

- To load images from another site, add it to `img-src`: `img-src 'self' data: https://cdn.example.com`.
- A login in a popup needs `Cross-Origin-Opener-Policy: same-origin-allow-popups`.
- Delete the HSTS line if a proxy already sends it, or a subdomain is served over HTTP.
- Under `vite dev` the page goes without its CSP and without HSTS; `vite preview` sends them all.

`sw.headers` holds the worker's own policy, `script-src 'self' 'unsafe-eval'`: without
`'unsafe-eval'` the worker cannot link the route chunks and the app is served without it.

fudic sends these itself, and writing them is `FUD1542`: `Content-Type`, `Content-Length`,
`Transfer-Encoding`, `Location` and `Set-Cookie` in all three; `Link` in `page.headers`;
`Cache-Control` and `Service-Worker-Allowed` in `sw.headers`; a block for `/fudic-sw.js` or
`/fudic-routes.json` in `assets.headers`.

### What to do with each code

| Code | What to do |
|---|---|
| `FUD1540` | A line that is no header: write `Name: value`, indent a continuation, give `assets.headers` its path. |
| `FUD1541` | A header written twice, or a name or value out of printable ASCII: keep one, rename it. |
| `FUD1542` | fudic sends that header itself: remove the line. |
| `FUD1543` | The header does not take that value: write one the message lists. In `page.headers` and `sw.headers`, remove a header instead of leaving it empty. |
| `FUD1544` | No such CSP directive: fix its spelling; the browser ignores it. |
| `FUD1545` | The page policy blocks something fudic emitted: add the source the message names to that directive. |
| `FUD1546` | `{nonce}` out of place, a placeholder that is none, or a literal nonce: write `'nonce-{nonce}'` in a source list of `page.headers`. |
| `FUD1547` | The page policy lets in more than it needs: remove that source, or add `object-src 'none'`, `base-uri` and `frame-ancestors`. |
| `FUD1548` | The worker policy blocks its linker: add `'unsafe-eval'` to `script-src` of `sw.headers`. |
| `FUD1549` | That referrer policy leaves `back` empty: use `strict-origin-when-cross-origin`. |
| `FUD1550` | HSTS `preload` needs `max-age` of a year or more and `includeSubDomains`. |
| `FUD1551` | `no-cache` on a hashed file the Service Worker caches: give that path a long cache. |
| `FUD1552` | A long cache on a file without a hash: the browser keeps the old one. Give it `no-cache`. |
| `FUD1553` | A rule that matches no file of the build: fix its path or remove it. |
| `FUD1554` | A headers file that applies to nothing: a library is not served, and `sw.headers` needs a `sw.json`. Delete it. |
| `FUD1555` | Trusted Types will refuse a string handed to that sink: build the HTML with the DOM, or pass a `TrustedHTML`. |
| `FUD1556` | The policy keeps a source fudic no longer needs: remove it. |

`FUD1545`, `FUD1548`, `FUD1551`–`FUD1553` and `FUD1556` need the output: the build says them, and
the editor after a build. `fudic_check` says every other one.
