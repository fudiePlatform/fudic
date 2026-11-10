/**
 * The plan of a page's or a flow's `.fudspec` (SDD-82 §4.2, §4.3): no page is generated — each
 * criterion opens the app's own URL — and each one carries what the bench begins it with, read
 * off its fixture lines and the EXECUTED fixture: the `data` of its page in order, the answers
 * of its `answers` groups merged (the last one wins), its services. Pure.
 */

import { FUD1207 } from '@fudic/diagnostics';
import type { SpecFile } from '@fudic/spec';
import type { CriterionNames, CriterionSetup, ServiceOverride } from '@fudic/vite';
import type { App } from './app.js';
import { readCriterion, type FixtureLines, type PlannedCriterion } from './pages.js';
import type { BenchTarget } from './target.js';

/** A page's or a flow's fixture, executed: groups by name. */
export interface AppFixtures {
  readonly data?: Readonly<Record<string, unknown>>;
  readonly paths?: readonly string[];
  readonly calls?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly services?: Readonly<Record<string, readonly ServiceOverride[]>>;
}

export interface AppPlanInput {
  readonly target: BenchTarget;
  readonly spec: SpecFile;
  readonly fixtures: AppFixtures;
  readonly app: Pick<App, 'origin' | 'bench' | 'run'>;
  /** A page's URL pattern: `/blog/:slug`. */
  readonly pattern?: string;
}

/** `/blog/:slug` with `dsd-in-depth`: each param takes its segment of the value, in order. */
export function fillPattern(pattern: string, value: string): string {
  const parts = value.split('/');
  let at = 0;
  return pattern.replace(/:[^/]+/gu, () => encodeURIComponent(parts[at++] ?? ''));
}

/** `<root>/src/routes/usuarios.fud` → `routes/usuarios`: the `<id>` of the route's `.fudapi`. */
export function routeId(page: string, root: string): string {
  return page.slice(`${root}/src/`.length, -'.fud'.length);
}

/** What `lines` names in the fixture; the first name it has not is the error. */
function setupOf(lines: FixtureLines, fixtures: AppFixtures, base: CriterionSetup): CriterionSetup | Missing {
  try {
    const data = (lines.data ?? []).map((name) => pick(fixtures.data, name));
    const answers = lines.answers?.reduce<Record<string, unknown>>((all, name) => ({ ...all, ...pick(fixtures.calls, name) }), {});
    const services = lines.services === undefined ? undefined : pick(fixtures.services, lines.services);
    return {
      ...base,
      ...(data.length > 0 ? { data } : {}),
      ...(answers !== undefined ? { answers } : {}),
      ...(services !== undefined ? { services } : {}),
    };
  } catch (missing) {
    return missing as Missing;
  }
}

/** A name the fixture does not have. */
class Missing {
  constructor(readonly name: string) {}
}

/** The entry `name` of `group`; a `Missing` thrown when it has none. */
function pick<T>(group: Readonly<Record<string, T>> | undefined, name: string): T {
  if (group === undefined || !Object.hasOwn(group, name)) throw new Missing(name);
  return group[name]!;
}

export function planApp(input: AppPlanInput): PlannedCriterion[] {
  const { target, app } = input;
  const spec = target.spec as string;
  const dir = spec.slice(0, spec.lastIndexOf('/'));
  const base: CriterionSetup = { dir, ...(target.kind === 'page' ? { route: routeId(target.component, target.projectRoot) } : {}) };
  const planned: PlannedCriterion[] = [];
  for (const criterion of input.spec.criteria) {
    if (criterion.slug === undefined) continue;
    const id = criterion.slug.text;
    const { steps, lines } = readCriterion(criterion);
    const route = lines.url ?? (lines.path !== undefined ? fillPattern(input.pattern ?? '/', lines.path) : (input.pattern ?? '/'));
    const names: CriterionNames = {
      ...(lines.services !== undefined ? { services: lines.services } : {}),
      ...(lines.answers !== undefined ? { answers: lines.answers } : {}),
    };
    const setup = setupOf(lines, input.fixtures, base);
    const plan = { id, route, mount: 'body', fixture: null, offset: criterion.keyword.start, spec, steps };
    if (setup instanceof Missing) {
      const error = `the fixture has no entry "${setup.name}"`;
      planned.push({ ...plan, error, problem: FUD1207({ reason: error }) });
      continue;
    }
    planned.push({ ...plan, app: { origin: app.origin, bench: app.bench, run: app.run, setup, names } });
  }
  return planned;
}
