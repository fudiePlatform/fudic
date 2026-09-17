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

## Building a tag

```ts
tagOf('shop', 'card');            // 'shop-card'
tagOf('shop', 'signal-counter');  // 'signal-counter' — already a tag, untouched
tagOf('', 'card');                // 'card'
```
