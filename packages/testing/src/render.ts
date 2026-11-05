/**
 * `renderJob`: one piece painted for someone who wants to see it (SDD-78), inside the project's
 * vitest — the same render its tests see. A route is `visit`ed, a component `mount`ed with a case
 * of its fixture and props on top. What comes out is its outline, its markup with the shadow
 * roots written back as declarative ones, the document a chat can draw, and the functions it
 * called. Never throws: what fails is an outcome.
 *
 * Internal: `@fudic/testing/run` writes the test file that calls it.
 */

import { FN_PREFIX } from '@fudic/conventions';
import { contractIds, contractsOf } from '@fudic/http/contract';
import { urlForEntry } from '@fudic/vite';
import { matchRouteBuild, pageModuleOf, type RouteBuild } from '@fudic/vite/harness';
import { serverRoot } from './api.js';
import { recordCalls, type RecordedCall } from './fetch.js';
import { mount, type MountTarget } from './mount.js';
import { outline } from './outline.js';
import { loadWrapper, routeFacts } from './page.js';
import { projectOf } from './project.js';
import { previewDocument, serialize } from './serialize.js';
import { takeUnexpected, visit } from './visit.js';

/** A call the piece made, by the name of its function when the project has one at that URL. */
export interface PieceCall extends RecordedCall {
  /** `<id>.<name>`: `routes/products.save`. */
  readonly fn?: string;
}

/** Whether `parts` fits `pattern`, a segment that is a param fitting any value. */
function fits(pattern: readonly string[], parts: readonly string[], param: (segment: string) => boolean): boolean {
  return pattern.length === parts.length && pattern.every((segment, i) => param(segment) || segment === parts[i]);
}

/** `<id>.<name>` of the function at `path`, as the server's dispatcher reads it. */
export function fnOf(path: string): string | undefined {
  const parts = path.slice(`${FN_PREFIX}/`.length).split('/');
  for (const id of contractIds()) {
    const segments = id.split('/');
    if (!fits(segments, parts.slice(0, segments.length), (s) => s.startsWith('['))) continue;
    for (const [name, contract] of contractsOf(id)) {
      const rest = parts.slice(segments.length);
      if (rest[0] === name && fits(contract.spec.route ?? [], rest.slice(1), (s) => s.startsWith(':'))) return `${id}.${name}`;
    }
  }
  return undefined;
}

function named(call: RecordedCall): PieceCall {
  const fn = fnOf(call.path);
  return fn === undefined ? call : { ...call, fn };
}

/** What was thrown, as the outcome carries it. */
function thrownOf(error: unknown): RenderOutcome {
  const thrown = error instanceof Error ? error : new Error(String(error));
  return { kind: 'threw', error: { message: thrown.message, stack: String(thrown.stack) } };
}

/** What to paint. */
export type RenderTarget =
  | { readonly route: string }
  | {
      readonly component: MountTarget;
      /** The fixture's `export default`, when the piece has one. */
      readonly fixture?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
      /** The case of the fixture to paint. */
      readonly case?: string;
      readonly props?: Readonly<Record<string, unknown>>;
    };

export interface RenderJob {
  readonly target: RenderTarget;
  /** A CSS selector, through shadow roots, that narrows the outline and the HTML. */
  readonly select?: string;
}

/** A thrown error, with the frames of its stack the caller can place in a source. */
export interface RenderError {
  readonly message: string;
  readonly stack: string;
}

export type RenderOutcome =
  | {
      readonly kind: 'rendered';
      /** The status the dev server would answer with: a route's. */
      readonly status?: number;
      readonly outline: string;
      readonly html: string;
      /** A whole document with no script: what a chat draws. */
      readonly preview: string;
      readonly calls: readonly PieceCall[];
    }
  | { readonly kind: 'no-case'; readonly cases: readonly string[] }
  | { readonly kind: 'no-route'; readonly paths: readonly string[] }
  | { readonly kind: 'no-match'; readonly select: string }
  | { readonly kind: 'threw'; readonly error: RenderError };

/** The concrete URLs a route with params can be opened at: those of its `paths()`. */
async function pathsOf(rb: RouteBuild): Promise<readonly string[]> {
  await serverRoot();
  const mod = (await loadWrapper(pageModuleOf(rb), routeFacts(rb))) as { paths?: () => Promise<readonly unknown[]> };
  if (typeof mod.paths !== 'function') return [];
  return (await mod.paths()).flatMap((entry) => {
    const built = urlForEntry(rb.route.pattern, entry as Parameters<typeof urlForEntry>[1]);
    return 'url' in built ? [built.url] : [];
  });
}

/** Every URL of the project that can be opened as it is: the routes without params, and the `paths()` of the rest. */
export async function concreteRoutes(): Promise<readonly string[]> {
  const urls: string[] = [];
  for (const rb of projectOf().routes) {
    if (rb.decision.mode === 'excluded') continue;
    urls.push(...(rb.route.params.length === 0 ? [rb.route.pattern] : await pathsOf(rb)));
  }
  return urls;
}

/** The route `url` names, when it is a concrete one; a pattern names none. */
function routeOf(url: string): RouteBuild | null {
  if (url.split('/').some((segment) => segment.startsWith(':'))) return null;
  return matchRouteBuild(projectOf().routes, url.split('?')[0]!);
}

/** The first element under `root` that matches `selector`, looking into every shadow root. */
export function deepSelect(root: ParentNode, selector: string): Element | null {
  const found = root.querySelector(selector);
  if (found !== null) return found;
  for (const element of root.querySelectorAll('*')) {
    const inner = element.shadowRoot === null ? null : deepSelect(element.shadowRoot, selector);
    if (inner !== null) return inner;
  }
  return null;
}

/** The case of the fixture with the props on top, or the cases it has when it has not that one. */
function propsOf(target: Extract<RenderTarget, { component: MountTarget }>): { props: Record<string, unknown> } | { cases: readonly string[] } {
  const fixture = target.fixture ?? {};
  if (target.case !== undefined && !(target.case in fixture)) return { cases: Object.keys(fixture) };
  // `$content` is the children of a case, not a prop of it.
  const { $content: _, ...values } = target.case === undefined ? {} : fixture[target.case]!;
  return { props: { ...values, ...target.props } };
}

async function paint(job: RenderJob): Promise<RenderOutcome> {
  const { target } = job;
  let root: Element;
  let status: number | undefined;
  const calls = recordCalls();
  if ('route' in target) {
    const rb = routeOf(target.route);
    if (rb === null) {
      const pattern = projectOf().routes.find((r) => r.route.pattern === target.route);
      return { kind: 'no-route', paths: pattern === undefined ? [] : await pathsOf(pattern) };
    }
    const page = await visit(target.route);
    const unexpected = takeUnexpected();
    if (unexpected !== undefined) return thrownOf(unexpected);
    root = page.document.body;
    status = page.status;
  } else {
    const asked = propsOf(target);
    if ('cases' in asked) return { kind: 'no-case', cases: asked.cases };
    root = (await mount(target.component, { props: asked.props })).host;
  }
  const chosen = job.select === undefined ? root : deepSelect(root, job.select);
  if (chosen === null) return { kind: 'no-match', select: job.select! };
  const html = serialize(chosen);
  return {
    kind: 'rendered',
    ...(status !== undefined ? { status } : {}),
    outline: outline(chosen),
    html,
    preview: previewDocument(document, html),
    calls: calls().map(named),
  };
}

export async function renderJob(job: RenderJob): Promise<RenderOutcome> {
  try {
    return await paint(job);
  } catch (error) {
    return thrownOf(error);
  }
}
export { callJob, forward, type CallJob, type CallOutcome } from './call.js';
