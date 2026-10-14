/**
 * Where the harness writes the modules it generates: host pages and their render wrappers.
 *
 * On disk, because the plugin compiles a `.fud` by reading it, and the test asks for modules
 * by id from a worker that cannot hand the dev server a source. Under the project's
 * `node_modules`, so no watcher sees them and no repository keeps them — the same place the
 * workbench writes its pages. Named by content: the same page is the same file, written once.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inject } from 'vitest';
import { CACHE_FOLDER, ROOT_KEY } from './config.js';

declare module 'vitest' {
  export interface ProvidedContext {
    fudicRoot: string;
  }
}

/** Write `source` under the cache as `<name>-<hash>.<ext>` and hand back its absolute path. */
export function cached(name: string, ext: string, source: string): string {
  const dir = join(inject(ROOT_KEY), CACHE_FOLDER);
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 16);
  const file = join(dir, `${name}-${hash}.${ext}`).replace(/\\/gu, '/');
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, source);
  }
  return file;
}
