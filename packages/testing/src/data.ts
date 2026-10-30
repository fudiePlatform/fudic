/**
 * The data endpoint of the in-memory server: `GET /_fudic/data/<route>` answered as `vite dev`
 * answers it — the route's wrapper runs `load` (and `layout`) with the request, and the answer
 * is its frames (SDD-70 §3.7). What `load` throws is the problem of its status.
 *
 * It is what a page asks after a call invalidated it (SDD-68 §4.8): without it, every `save`
 * in a test would fail its refresh and reload the document.
 */

import { DATA_FRAMES_TYPE } from '@fudic/conventions';
import { classifyError, loadRouteData, matchRouteBuild, pageModuleOf } from '@fudic/vite/harness';
import { loadWrapper, routeFacts } from './page.js';
import { projectOf } from './project.js';

/** Answer a request whose path, past `base`, starts with the data prefix. */
export async function routeData(request: Request, prefix: string): Promise<Response> {
  const { routes } = projectOf();
  // The caller routes only paths past `${prefix}/`, so what is left starts with `/`.
  const routePath = new URL(request.url).pathname.slice(prefix.length);
  const rb = matchRouteBuild(routes, routePath);
  if (rb === null) return new Response(null, { status: 404 });
  try {
    const wrapper = (): ReturnType<typeof loadWrapper> => loadWrapper(pageModuleOf(rb), routeFacts(rb));
    const frames = await loadRouteData(wrapper, '', rb.route.pattern, routePath, request);
    if (frames === null) return new Response(null, { status: 404 });
    return new Response(frames, { headers: { 'content-type': DATA_FRAMES_TYPE } });
  } catch (error) {
    const failure = classifyError(error, true);
    const problem =
      failure.kind === 'redirect' ? { status: failure.status, title: 'Redirect', location: failure.location } : failure.problem;
    return Response.json(problem, { status: problem.status, headers: { 'content-type': 'application/problem+json' } });
  }
}
