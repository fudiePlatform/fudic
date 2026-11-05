/**
 * `fudic_preview`: the whole app, running, at a URL a person opens (SDD-78 §4.3). The dev server
 * starts the first time and stays; with HMR, what the chat writes is seen without calling again.
 * Opening it shows the app: it approves nothing.
 */

import { FUD1207, FUD1404, FUD1422, FUD1424, FUD1425, type WireDiagnostic } from '@fudic/diagnostics';
import type { Checks } from './checks.js';
import { missingOf } from './dev-server.js';
import type { Problem } from './diagnostics.js';
import { loadRunners, type Runners } from './fudic.js';
import { matches, placeOfStack, routeOf } from './piece.js';
import { isFudicProject, type Project } from './project.js';
import type { Answer } from './respond.js';
import type { Site } from './site.js';

export interface PreviewInput {
  readonly route?: string;
}

export interface PreviewDeps {
  readonly runners: (root: string) => Promise<Runners>;
  /** How long the first call waits for the server. */
  readonly waitMs?: number;
}

const nodePreviewDeps: PreviewDeps = { runners: (root) => loadRunners(root) };

function fromWire(d: WireDiagnostic): Problem {
  return { code: d.code, severity: d.severity, message: d.message };
}

/** What the app threw while it ran, once each, placed in its source. */
function thrown(site: Site, root: string): readonly Problem[] {
  return site.dev.takeErrors().map((error) => {
    const place = placeOfStack(error.stack, root);
    return FUD1425({ reason: error.message, ...(place !== undefined ? { file: place.file, span: place.span } : {}) });
  });
}

export async function previewTool(project: Project, checks: Checks, site: Site, input: PreviewInput, deps: PreviewDeps = nodePreviewDeps): Promise<Answer> {
  const { root } = project;
  if (!isFudicProject(root)) return { body: {}, diagnostics: [FUD1404({ folder: root })], failed: true };
  const app = site.dev.app;
  const missing = missingOf(app);
  if (missing !== undefined) return { body: {}, diagnostics: [FUD1207({ reason: missing })], failed: true };
  const { listRoutes } = await deps.runners(app);
  if (listRoutes === undefined) {
    return { body: {}, diagnostics: [FUD1207({ reason: '@fudic/testing is not installed in the project: pnpm add -D @fudic/testing' })], failed: true };
  }
  const listed = await listRoutes({ root: app });
  if (listed.kind === 'broken') return { body: {}, diagnostics: listed.diagnostics.map(fromWire), failed: true };
  const routes = listed.routes;
  const to = input.route ?? '/';
  const service = await checks.service();
  if (input.route !== undefined) {
    // A concrete URL that a route answers; a pattern is no URL, and its `paths()` are the ones to try.
    const piece = routeOf(service, input.route);
    if (piece === undefined || input.route.split('/').some((segment) => segment.startsWith(':'))) {
      const paths = piece === undefined ? [] : routes.filter((url) => matches(piece.name, url));
      return { body: { route: input.route }, diagnostics: [FUD1422({ url: input.route, paths })], failed: true };
    }
  }

  const state = await site.dev.ready(deps.waitMs);
  if (state === 'failed') return { body: { state }, diagnostics: [FUD1424({ reason: site.dev.failure })], failed: true };
  if (state !== 'ready') return { body: { state, routes }, next: 'The preview is still starting: call fudic_preview again in a moment.' };

  const urls = site.urls(to);
  // A route with params and no `paths()` has no URL to list: it is opened with concrete values.
  const unlisted = service
    .pieces()
    .filter((p) => p.kind === 'route' && p.name.includes(':') && !routes.some((url) => matches(p.name, url)))
    .map((p) => p.name);
  const give = `Give the user the ${urls.public !== undefined ? 'public' : 'local'} URL. Opening it is how they see the app; it does not approve anything.`;
  return {
    body: { state, ...urls, routes },
    diagnostics: thrown(site, root),
    next: unlisted.length === 0 ? give : `${give} ${unlisted.join(', ')} ${unlisted.length === 1 ? 'has' : 'have'} params and no paths(): open ${unlisted.length === 1 ? 'it' : 'them'} with concrete values.`,
  };
}
