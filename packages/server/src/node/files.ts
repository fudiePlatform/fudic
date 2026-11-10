/**
 * The build's own files on Node (SDD-81 §3.10): what `fetch` answers `null` for — the scripts,
 * the styles, the images, the worker — is the host's to serve. A Node adapter puts this after
 * `nodeMiddleware`, whose `next` it is: the extra headers of the app's static files are on the
 * response already when it gets here.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import type { NodeMiddleware } from './index.js';

/** The types a build writes, by extension. Anything else goes out as bytes. */
const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/**
 * The files under `dir` (the build's `outDir`), for a `GET` or a `HEAD`: its type and length, and
 * the bytes streamed. A path that is no file there, or would leave `dir`, goes on to `next`.
 */
export function staticFiles(dir: string): NodeMiddleware {
  return (req, res, next) => {
    // A request of `node:http` always has both.
    const method = req.method!;
    if (method !== 'GET' && method !== 'HEAD') return next();
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url!, 'http://files').pathname);
    } catch {
      return next();
    }
    const file = join(dir, pathname);
    const inside = relative(dir, file);
    if (inside === '' || inside.startsWith('..')) return next();
    stat(file).then(
      (info) => {
        if (!info.isFile()) return next();
        res.statusCode = 200;
        res.setHeader('content-type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('content-length', String(info.size));
        if (method === 'HEAD') return void res.end();
        createReadStream(file).on('error', next).pipe(res);
      },
      () => next(),
    );
  };
}
