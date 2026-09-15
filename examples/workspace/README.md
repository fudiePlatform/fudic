# `@fudic/example-workspace`

Two fudic applications published on **one origin**.

```
apps/tienda   →  /         id "tienda"
apps/admin    →  /admin/   id "tienda-admin"
```

They are two projects, not two configurations of one: each has its own `package.json`,
its own dependencies, its own `src/` and its own build. Nothing is shared between them
except the host they end up on.

## Run it

From the repo root, with the packages built:

```sh
pnpm install
pnpm build
pnpm --filter @fudic/example-workspace build     # builds both apps
pnpm --filter @fudic/example-workspace serve     # http://localhost:4373
```

`/` is the storefront and `/admin/` is the back office. Each registers its own Service
Worker, scoped to its own directory.

## The end-to-end suite

```sh
pnpm --filter @fudic/example-workspace test:e2e
```

It builds both apps, serves them on one origin and drives the browser through the case
the origin exists to show: visit one app, visit the other, cut the network, go back to
the first. Both open.

`serve.mjs` is what makes that possible — a static server that mounts two independent
builds side by side, the way a reverse proxy or a static host does. Two ports would not
do: `CacheStorage` belongs to the origin, so two origins have two of them and there is
nothing left to observe.

## Check it by hand

With both apps served, open DevTools → Application → Cache Storage:

```
shell-tienda-<build>          routes-tienda-<build>          …
shell-tienda-admin-<build>    routes-tienda-admin-<build>    …
```

Eight caches, four per application, and the application's `id` is the middle segment.
Visiting one app must never make the other's disappear.
