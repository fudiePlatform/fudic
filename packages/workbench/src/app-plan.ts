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
import { readCriterion, type FixtureLines, type PlannedCriterion, type PlannedStep } from './pages.js';
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
  readonly app: Pick<App, 'origin' | 'bench' | 'run' | 'paths'>;
  /** A page's URL pattern: `/blog/:slug`. */
  readonly pattern?: string;
  /** Where the app built is served: the origin of every criterion without network (§4.7). */
  readonly offline?: string;
}

/** The term that cuts the network, in `given` or in `when`. */
const OFFLINE = 'offline';

/** Whether a criterion goes without network: it runs on the app built (SDD-82 §4.7). */
export function needsOffline(steps: readonly PlannedStep[]): boolean {
  return steps.some((step) => step.term === OFFLINE && step.block !== 'then');
}

/** `/blog/:slug` with `dsd-in-depth`: each param takes its segment of the value, in order. */
export function fillPattern(pattern: string, value: string): string {
  const parts = value.split('/');
  let at = 0;
  return pattern.replace(/:[^/]+/gu, () => encodeURIComponent(parts[at++] ?? ''));
}

/**
 * One entry of a real `paths()` as `path <value>` writes it: a string or a number as it is, an
 * object by the params of `pattern` in order (`{ year: 2026, slug: 'hola' }` → `2026/hola`).
 */
export function entryValue(pattern: string, entry: unknown): string {
  if (typeof entry !== 'object' || entry === null) return String(entry);
  const names = [...pattern.matchAll(/:([^/]+)/gu)].map((match) => match[1]!);
  return names.map((name) => String((entry as Record<string, unknown>)[name] ?? '')).join('/');
}

/** What the page's real `paths()` lists, as values; null when it has no `paths`. */
async function listed(app: Pick<App, 'paths'>, pattern: string): Promise<readonly string[] | null> {
  const entries = await app.paths(pattern);
  return entries === null ? null : entries.map((entry) => entryValue(pattern, entry));
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
    const origin = needsOffline(steps) ? (input.offline ?? app.origin) : app.origin;
    const paths = target.kind === 'page' ? { paths: () => listed(app, input.pattern ?? '/') } : {};
    planned.push({ ...plan, app: { origin, bench: app.bench, run: app.run, setup, names, ...paths } });
  }
  return planned;
}
