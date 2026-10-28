/**
 * The in-memory server (§4.6): the functions of the app's `.fudapi`, answered by the generated
 * server root (SDD-60 §4.4) as `vite dev` answers them.
 *
 * The root and the handlers it loads are imported through vitest's graph, so a `vi.mock` of the
 * test reaches what they import (§4.1). A request resolves from a fresh container with the
 * test's overrides in it.
 */

import { createRoot } from '@fudic/di';
import { noFunction } from '@fudic/http/server';
import { serverRoot } from './api.js';
import { projectOf } from './project.js';
import { overridden } from './providers.js';

let handler: ((request: Request) => Promise<Response | null>) | undefined;

/** The handler of `/_fudic/fn/`, armed once per test file. */
export function functions(): (request: Request) => Promise<Response | null> {
  if (handler === undefined) {
    const { base } = projectOf();
    const container = (): ReturnType<typeof createRoot> => overridden(createRoot());
    handler = async (request) => {
      const api = await serverRoot();
      // An app without a `.fudapi` has no function to call: the 404 its dispatcher would give.
      if (api === undefined) return noFunction(request);
      return api.handler({ base, dev: true, container })(request);
    };
  }
  return handler;
}
