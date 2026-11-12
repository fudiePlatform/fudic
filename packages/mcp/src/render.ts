/**
 * `fudic_render`: one piece painted, at once and with no server started (SDD-78 §4.1). With
 * `happy-dom`, by the project's vitest — the render its tests see —; with `browser`, in the
 * bench's. It answers the outline or the markup, the functions it called, and, for a chat that
 * draws it, the document in `_meta`: thousands of tokens the model does not need.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FUD1207,
  FUD1404,
  FUD1420,
  FUD1421,
  FUD1422,
  FUD1423,
  FUD1428,
  type WireDiagnostic,
} from '@fudic/diagnostics';
import type { Piece, ProjectService } from '@fudic/language-server/project';
import { VIEW_META_KEY } from './apps.js';
import type { Checks } from './checks.js';
import type { Problem } from './diagnostics.js';
import { loadRunners, type Runners } from './fudic.js';
import { componentOf, fixtureFile, placeOfStack, routeOf } from './piece.js';
import { isFudicProject, projectOf, type Project } from './project.js';
import type { Answer } from './respond.js';
import type { RunQueue } from './runs.js';
import { fixtureLines, type FixtureLines, type RouteFixture } from './route-fixture.js';

export const ENGINES = ['happy-dom', 'browser'] as const;
export const RENDER_AS = ['outline', 'html'] as const;

export interface RenderInput {
  readonly route?: string;
  readonly component?: string;
  /** A component: a case of its fixture. A route: what its fixture is asked for; a name alone is its `data`. */
  readonly fixture?: string | RouteFixture;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly as: (typeof RENDER_AS)[number];
  readonly select?: string;
  readonly engine: (typeof ENGINES)[number];
}

export interface RenderDeps {
  readonly runners: (root: string) => Promise<Runners>;
}

const nodeRenderDeps: RenderDeps = { runners: (root) => loadRunners(root) };

/** A diagnostic of a run, as a problem an answer places. */
function fromWire(d: WireDiagnostic): Problem {
  return { code: d.code, severity: d.severity, message: d.message, ...(d.file !== null ? { file: d.file } : {}) };
}

/** What the function at a call is, and whether its handler is missing. */
function missingFns(service: ProjectService): ReadonlySet<string> {
  return new Set(service.symbols('functions').filter((s) => s.state === 'missing').map((s) => s.name));
}

/** The folder of a route: in a workspace, the app that holds its `.fud`. */
function folderOf(folders: readonly string[], root: string, piece: Piece | undefined): string {
  return piece === undefined ? (folders.find((f) => existsSync(join(f, 'src', 'routes'))) ?? folders[0]!) : projectOf(folders, root, piece.file);
}

/** What `as` asks for, under its own name. */
function shown(as: RenderInput['as'], outline: string, html: string): Readonly<Record<string, string>> {
  return as === 'outline' ? { outline } : { html };
}

/** Where the last shot of a render in the browser is kept, relative to the project. */
export const RENDERS_DIR = '.fudic/renders';

/**
 * The shot, on disk: one per component, the last, named by its bytes so a URL of a previous one
 * never shows the new one. Answers its path, relative to the project.
 */
function keepShot(root: string, tag: string, fixture: string | undefined, png: Buffer): string {
  const dir = join(root, RENDERS_DIR, tag);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const name = `${fixture ?? 'props'}-${createHash('sha256').update(png).digest('hex').slice(0, 12)}.png`;
  writeFileSync(join(dir, name), png);
  return `${RENDERS_DIR}/${tag}/${name}`;
}

export async function renderTool(project: Project, checks: Checks, queue: RunQueue, input: RenderInput, deps: RenderDeps = nodeRenderDeps): Promise<Answer> {
  const { root } = project;
  if (!isFudicProject(root)) return { body: {}, diagnostics: [FUD1404({ folder: root })], failed: true };
  const service = await checks.service();
  const folders = await checks.folders();
  const asked = input.component !== undefined ? { component: input.component } : { route: input.route ?? '/' };
  const head = { ...asked, ...(input.fixture !== undefined ? { fixture: input.fixture } : {}), engine: input.engine, as: input.as };
  const fail = (diagnostics: readonly Problem[]): Answer => ({ body: head, diagnostics, failed: true });

  let piece: Piece | undefined;
  if ('component' in asked) {
    const found = componentOf(service, asked.component);
    if ('error' in found) return fail([found.error]);
    piece = found.piece;
  } else piece = routeOf(service, asked.route);

  // A component is painted with a case of its fixture, by its name; a route with what its fixture
  // is asked for, checked against it before anything runs (SDD-82 §3.10). A name alone is `data`.
  let caseName: string | undefined;
  let lines: FixtureLines | undefined;
  if ('component' in asked) {
    if (typeof input.fixture === 'object') return fail([FUD1207({ reason: 'a component is painted with a case of its fixture: "fixture" is the name of the case' })]);
    caseName = input.fixture;
  } else if (input.fixture !== undefined && piece !== undefined) {
    const checked = fixtureLines(piece.file, typeof input.fixture === 'string' ? { data: input.fixture } : input.fixture);
    if ('problem' in checked) return fail([checked.problem]);
    lines = checked.lines;
  }

  const folder = 'component' in asked ? projectOf(folders, root, piece!.file) : folderOf(folders, root, piece);
  const runners = await deps.runners(folder);
  const threw = (reason: string, stack: string): Answer => {
    const place = placeOfStack(stack, root);
    const file = place?.file ?? piece?.file ?? join(folder, 'src', 'routes');
    return fail([FUD1420({ piece: asked.component ?? asked.route!, reason, file, ...(place !== undefined ? { span: place.span } : {}) })]);
  };

  if (input.engine === 'browser') {
    if ('route' in asked) return fail([FUD1207({ reason: 'engine "browser" renders a component; a route is rendered with happy-dom or seen with fudic_preview' })]);
    if (runners.renderInBrowser === undefined) {
      return fail([FUD1207({ reason: '@fudic/workbench is not installed in the project: pnpm add -D @fudic/workbench' })]);
    }
    const renderInBrowser = runners.renderInBrowser;
    const result = await queue.run(() =>
      renderInBrowser({
        component: piece!.file,
        ...(caseName !== undefined ? { case: caseName } : {}),
        ...(input.props !== undefined ? { props: input.props } : {}),
        ...(input.select !== undefined ? { select: input.select } : {}),
      }),
    );
    if ('diagnostic' in result) return fail([result.diagnostic]);
    if (result.kind === 'no-case') return fail([FUD1421({ tag: asked.component, name: caseName!, cases: result.cases })]);
    if (result.kind === 'not-json') return fail([FUD1428({ prop: result.prop })]);
    if (result.kind === 'threw') return threw(result.message, '');
    return {
      body: { ...head, ...shown(input.as, result.outline, result.html), calls: [] },
      next: null,
      // What the browser drew, as it drew it: its shot, not the markup painted again elsewhere.
      ...(result.png !== undefined ? { meta: { [VIEW_META_KEY]: { kind: 'shot', png: keepShot(root, asked.component, caseName, result.png) } } } : {}),
    };
  }

  if (runners.renderPiece === undefined) {
    return fail([FUD1207({ reason: '@fudic/testing is not installed in the project: pnpm add -D @fudic/testing' })]);
  }
  const renderPiece = runners.renderPiece;
  const fixture = piece !== undefined && 'component' in asked ? fixtureFile(piece) : undefined;
  if ('component' in asked && caseName !== undefined && fixture === undefined) {
    return fail([FUD1421({ tag: asked.component, name: caseName, cases: [] })]);
  }
  const target =
    'component' in asked
      ? {
          component: piece!.file,
          ...(fixture !== undefined ? { fixture } : {}),
          ...(caseName !== undefined ? { case: caseName } : {}),
          ...(input.props !== undefined ? { props: input.props } : {}),
        }
      : { route: asked.route, ...(lines !== undefined ? { fixture: lines } : {}) };
  const result = await queue.run(() => renderPiece({ root: folder, target, ...(input.select !== undefined ? { select: input.select } : {}) }));
  switch (result.kind) {
    case 'broken':
      return fail(result.diagnostics.map(fromWire));
    case 'threw':
      return threw(result.error.message, result.error.stack);
    case 'no-case':
      return fail([FUD1421({ tag: asked.component!, name: caseName!, cases: result.cases })]);
    case 'no-route':
      return fail([FUD1422({ url: asked.route!, paths: result.paths })]);
    case 'no-match':
      return { body: { ...head, ...shown(input.as, '', ''), calls: [] }, next: `Nothing in it matches ${result.select}.` };
    case 'rendered': {
      const missing = missingFns(service);
      const calls = result.calls.map((c) => ({ fn: c.fn ?? c.path, status: c.status }));
      const unconnected = [...new Set(calls.filter((c) => c.status === 404 && missing.has(c.fn)).map((c) => c.fn))];
      // A route's `load` runs in its server render, not through `fetch`: it is a call all the
      // same, with the page's status. Without a handler, that status is its 404.
      // Not when the fixture handed its data instead: that load never ran (SDD-82 §3.10).
      const load = 'route' in asked && piece?.sibling !== undefined && lines?.fixture === undefined ? service.handlers(piece.sibling)?.find((h) => h.kind === 'load') : undefined;
      if (load !== undefined) {
        calls.unshift({ fn: load.name, status: result.status! });
        if (load.state === 'missing') unconnected.unshift(load.name);
      }
      return {
        body: {
          ...head,
          ...(result.status !== undefined ? { status: result.status } : {}),
          ...shown(input.as, result.outline, result.html),
          calls,
        },
        diagnostics: unconnected.map((fn) => FUD1423({ fn })),
        next: unconnected.length === 0 ? null : `${unconnected[0]} has no handler yet: fudic_contract says what to write.`,
        meta: { [VIEW_META_KEY]: { kind: 'render', html: result.preview } },
      };
    }
  }
}

