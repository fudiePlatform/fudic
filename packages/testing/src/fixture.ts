/**
 * A route's fixture applied to a visit (SDD-82 §3.10): `visit('/usuarios', { fixture:
 * 'dos-personas', answers: ['busca-luis'] })` reads `<route>.fixture.ts` beside the page and
 * applies it as the workbench does — with the workbench's own bench, so one fixture means the
 * same in a `.fudspec`, in a unit test and in the MCP.
 *
 * The visit becomes one criterion of a bench installed in this process: the fixture's lines are
 * its setup, and its cookie goes in the page's jar, so the render, every call the page makes and
 * every data request after an `invalidates` carry it. The server of the harness answers them as
 * dev answers the workbench: `load` hands the named `data` in order (the last one repeats), a
 * function named in `answers` answers without running its handler, and the services of the group
 * go into each request's root. What the fixture does not name runs for real.
 *
 * The fixture is imported through vitest's graph, as the page is: it is code (`services` builds
 * instances), and the bench needs its values, not its text.
 */

import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { BENCH_COOKIE, createBench, installBench, type Bench, type RouteBuild, type ServiceOverride } from '@fudic/vite/harness';
import { onCleanup } from './cleanup.js';

/** The lines of a fixture a visit applies, by their names in the route's fixture. */
export interface FixtureLines {
  /** What `load` returns, by name: the first for the page, the next for each data request after it. */
  readonly fixture?: string | readonly string[];
  /** The groups of `calls` that answer the page's functions; the last one that names a function wins. */
  readonly answers?: readonly string[];
  /** The group of `services` that takes the place of the real ones. */
  readonly services?: string;
}

/** The groups of a page's fixture, as its module exports them. */
interface PageFixture {
  readonly data?: Readonly<Record<string, unknown>>;
  readonly calls?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly services?: Readonly<Record<string, readonly ServiceOverride[]>>;
}

/** Where a route's fixture is: `<route>.fixture.ts`, beside its `.fud` (SDD-82 §3.4). */
const fixturePathOf = (page: string): string => `${page.slice(0, -'.fud'.length)}.fixture.ts`;

/** The bench of the running test, installed by its first visit with a fixture: its criteria and its undo. */
let installed: { readonly bench: Bench; readonly uninstall: () => void; readonly criteria: string[] } | undefined;
let visits = 0;

// What one test installed, the next does not find: its criteria end, and the server's `Date` is
// the real one again.
onCleanup(() => {
  if (installed === undefined) return;
  for (const criterion of installed.criteria) installed.bench.end(criterion);
  installed.uninstall();
  installed = undefined;
});

/** The bench of the running test, installed on its first visit that applies a fixture. */
function benchOf(): NonNullable<typeof installed> {
  if (installed !== undefined) return installed;
  const bench = createBench();
  installed = { bench, uninstall: installBench(bench), criteria: [] };
  return installed;
}

/** The entries `names` pick from `group`, in order; a name it lacks is the test's mistake. */
function pick<T>(url: string, what: string, group: Readonly<Record<string, T>> | undefined, names: readonly string[], path: string): T[] {
  return names.map((name) => {
    if (group === undefined || !Object.hasOwn(group, name)) {
      const have = Object.keys(group ?? {});
      throw new Error(`visit('${url}'): ${path} has no ${what} "${name}"${have.length === 0 ? '' : ` — it has ${have.join(', ')}`}`);
    }
    return group[name]!;
  });
}

/**
 * Begin the visit of `url` to the page `rb` as a criterion of the bench, with the lines of the
 * route's fixture; answers the cookie its requests carry, or `undefined` when no line is given.
 */
export async function applyFixture(url: string, rb: RouteBuild, lines: FixtureLines, data: unknown): Promise<string | undefined> {
  const names = lines.fixture === undefined ? [] : typeof lines.fixture === 'string' ? [lines.fixture] : lines.fixture;
  // A visit is one criterion: what an earlier visit of the same test began, this one does not carry.
  document.cookie = `${BENCH_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  if (names.length === 0 && lines.answers === undefined && lines.services === undefined) return undefined;
  if (names.length > 0 && data !== undefined) throw new Error(`visit('${url}'): \`data\` and \`fixture\` both say what load returns — give one`);
  if (names.length > 0 && !rb.analysis.hasLoad) throw new Error(`visit('${url}'): the route declares no load, so a fixture's data has nothing to replace`);
  const path = fixturePathOf(rb.absPath).replace(/\\/gu, '/');
  if (!existsSync(path)) throw new Error(`visit('${url}'): the route has no fixture — write ${path}`);
  const fixture = ((await import(/* @vite-ignore */ path)) as { readonly default?: PageFixture }).default ?? {};

  const answers = Object.assign({}, ...pick(url, 'calls group', fixture.calls, lines.answers ?? [], path)) as Record<string, unknown>;
  const [services] = pick(url, 'services group', fixture.services, lines.services === undefined ? [] : [lines.services], path);
  const id = `visit-${String(++visits)}`;
  const { bench, criteria } = benchOf();
  criteria.push(id);
  bench.begin(id, {
    ...(rb.analysis.api !== undefined ? { route: rb.analysis.api } : {}),
    data: pick(url, 'data', fixture.data, names, path),
    answers,
    ...(services !== undefined ? { services } : {}),
    dir: dirname(path),
  });
  const cookie = `${BENCH_COOKIE}=${id}`;
  document.cookie = `${cookie}; path=/`;
  return cookie;
}
