/**
 * The server root of the project under test (SDD-60 §4.4): the generated module that loads
 * `src/browser` and `src/server` in sequence and answers every function of a `.fudapi`.
 *
 * Imported through vitest's graph, as the pages are, so a `vi.mock` of the test reaches what a
 * handler imports. Loaded before a page is painted, which is what a browser does too: the client
 * halves a call runs are registered before anybody clicks.
 */

import { ROOT_FILE_PREFIX } from '@fudic/vite/harness';
import { projectOf } from './project.js';

/** What the harness reads of the server root. */
export interface ServerRoot {
  readonly ready: Promise<void>;
  handler(options: object): (request: Request) => Promise<Response | null>;
}

/** The server root with every implementation registered, or `undefined` without `.fudapi`. */
export async function serverRoot(): Promise<ServerRoot | undefined> {
  const { api, root: dir } = projectOf();
  if (!api) return undefined;
  // By the file the plugin resolves it to: a bare `fudic:` handed to `import()` would leave
  // vitest's graph for Node's, which knows no such package.
  const root = (await import(/* @vite-ignore */ `${dir.replace(/\\/gu, '/')}/${ROOT_FILE_PREFIX}server.js`)) as ServerRoot;
  await root.ready;
  return root;
}
