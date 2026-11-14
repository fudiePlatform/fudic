# `@fudic/config`

What a fudic project declares about itself. A leaf package, no runtime dependencies.

## The file

`fudic.json`, next to `package.json`. **A directory is a fudic project if it has one.**

```json
{
  "id": "shop",
  "kind": "app",
  "prefix": "shop"
}
```

| Field | Required | What it is |
|---|---|---|
| `id` | when the project has a `sw.json` | The identity of the application, stable across builds and deployments. It namespaces the Service Worker caches, and **it is never changed**: the caches of the previous value are then purged by nobody, ever. |
| `kind` | no — defaults to `"app"` | `"app"` or `"lib"`. A library has no routes, no `sw.json` and no build of its own. |
| `prefix` | no | What the CLI and the editor **propose** when you create a component. No hyphen: `tagOf` adds it. |

The prefix is a guide and nothing checks it. A project with `prefix: "app"` can define
`signal-counter` and no tool says a word — the naming convention of a project belongs to
whoever writes the project.

## Reading it

```ts
import { readProjectConfig } from '@fudic/config';

const { config, diagnostics } = readProjectConfig(root, {
  exists: (path) => existsSync(path),
  read: (path) => readFileSync(path, 'utf8'),
});
```

`config` is `null` when there is no file, or when the file is unusable — and then every
consumer behaves exactly as it did before the file existed. It **never throws**: an
unreadable or malformed file is a diagnostic, with the position of the guilty field.

## The headers of an app

Three text files next to `fudic.json` (SDD-84): `page.headers` (every page, served or painted by
the Service Worker), `sw.headers` (`/fudic-sw.js`) and `assets.headers` (the static files, by path).
What is in the file is what goes out; a missing file reads as its template, `HEADERS_TEMPLATES`,
which is also what the CLI writes.

```
# A comment, alone on its line.
Content-Security-Policy:
  default-src 'self'
  script-src 'nonce-{nonce}' 'strict-dynamic'
Referrer-Policy: strict-origin-when-cross-origin
```

One header per line; an indented line continues the one above, joined with `; ` in the CSP and
`, ` in the comma lists. `{nonce}` is the nonce of each response, only in `page.headers`. In
`assets.headers` every rule starts with a path (`/**`, `/assets/**`, `/legacy.js`), the most
specific path wins header by header, and an empty value sends nothing.

```ts
import { parseHeaders, readHeaders } from '@fudic/config';

const { config, diagnostics } = readHeaders(root, io, { kind: 'app', sw: true });
```

`parseHeaders(kind, text)` checks one file as you type; `readHeaders` reads the three, and like
every reader here it never throws. What a file says wrong is `FUD1540`–`FUD1556`, with its span.
`CSP_NEEDS_FILE` / `readCspNeeds` are what the build writes about what it emitted
(`.fudic/csp-needs.json`), and what the editor reads to compare it with the policy.

## Building a tag

```ts
tagOf('shop', 'card');            // 'shop-card'
tagOf('shop', 'signal-counter');  // 'signal-counter' — already a tag, untouched
tagOf('', 'card');                // 'card'
```
