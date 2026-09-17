/**
 * The origin.
 *
 * Two applications, each built on its own, mounted side by side on ONE host:
 *
 *   https://localhost:4373/         → apps/tienda/dist
 *   https://localhost:4373/admin/   → apps/admin/dist
 *
 * That composition is the whole point. `CacheStorage`, unlike almost everything else a
 * build derives, is a property of the ORIGIN and not of a Service Worker's scope — so two
 * applications that never share a file still share a cache namespace, and what keeps them
 * apart has to be the `id` each one declares. Two ports would prove nothing: two origins
 * have two `CacheStorage`s and the whole question disappears.
 *
 * It is deliberately a static file server and nothing else. This is what a reverse proxy
 * or a static host does with two independent deployments, and neither build knows the
 * other exists.
 */

import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Longest prefix wins, so `/admin/` is tried before `/`. */
const MOUNTS = [
  { prefix: '/admin/', root: join(HERE, 'apps', 'admin', 'dist') },
  { prefix: '/', root: join(HERE, 'apps', 'tienda', 'dist') },
];

const TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.map', 'application/json; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.png', 'image/png'],
  ['.woff2', 'font/woff2'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

/** The file a URL path names inside a mount, or `null` if it escapes the root. */
function resolveIn(root, rest) {
  // `normalize` collapses `..`; the guard is what makes the collapse safe to trust.
  const target = normalize(join(root, rest));
  if (target !== root && !target.startsWith(root + sep)) return null;
  return target;
}

async function fileFor(pathname) {
  for (const mount of MOUNTS) {
    if (!pathname.startsWith(mount.prefix)) continue;
    const rest = pathname.slice(mount.prefix.length);
    const target = resolveIn(mount.root, rest);
    if (target === null) return null;
    const direct = await stat(target).catch(() => null);
    // A route is published as `<route>/index.html`, so a directory — and a bare `/` —
    // resolves to its index.
    if (direct?.isDirectory() === true) {
      const index = join(target, 'index.html');
      return (await stat(index).catch(() => null))?.isFile() === true ? index : null;
    }
    if (direct?.isFile() === true) return target;
    return null;
  }
  return null;
}

const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  void fileFor(pathname).then((file) => {
    if (file === null) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(`404 ${pathname}`);
      return;
    }
    res.writeHead(200, {
      'content-type': TYPES.get(extname(file)) ?? 'application/octet-stream',
      // No HTTP caching, on purpose: what this origin is here to measure is what the
      // Service Worker kept in `CacheStorage`. A browser cache in the middle would answer
      // for it and hide exactly the defect under test.
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });
});

const port = Number(process.env['PORT'] ?? 4373);

for (const mount of MOUNTS) {
  if ((await stat(mount.root).catch(() => null))?.isDirectory() !== true) {
    console.error(`missing build: ${mount.root}\nrun \`pnpm --filter @fudic/example-workspace build\` first`);
    process.exit(1);
  }
}

server.listen(port, () => {
  console.log(`workspace origin on http://localhost:${port}/`);
  for (const mount of MOUNTS) console.log(`  ${mount.prefix} → ${mount.root}`);
});
