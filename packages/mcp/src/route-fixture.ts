/**
 * A route painted with its fixture (SDD-82 §3.10): `fudic_render` and `fudic_preview` take
 * `fixture: { data, answers, services }`, the names of what the route's `<route>.fixture.ts`
 * holds — the same fixture its `.fudspec` uses and its unit tests apply.
 *
 * The names are checked here against the fixture read without running it, as the editor reads
 * it: a name it does not have is `FUD1516`, and no fixture at all `FUD1517`. What runs it is
 * whoever paints: `@fudic/testing`'s `visit`, or the dev server of the preview.
 */

import { existsSync, readFileSync } from 'node:fs';
import { FUD1516, FUD1517, type FileDiagnostic } from '@fudic/diagnostics';
import { readFixtures, type FixtureGroup } from '@fudic/spec';

/** What the route's fixture is asked for, by name. */
export interface RouteFixture {
  /** What `load` returns: the first for the page, the next for each data request after it. */
  readonly data?: string | readonly string[];
  /** Groups of `calls` whose functions answer without running. */
  readonly answers?: readonly string[];
  /** The group of `services` in place of the real ones. */
  readonly services?: string;
}

/** The same, as `visit` and the bench read it: `data` is `fixture` there. */
export interface FixtureLines {
  readonly fixture?: readonly string[];
  readonly answers?: readonly string[];
  readonly services?: string;
}

/** Where a route's fixture is: `<route>.fixture.ts`, beside its `.fud`. */
export const routeFixtureOf = (page: string): string => `${page.slice(0, -'.fud'.length)}.fixture.ts`;

/** The lines to apply to the page at `page` (absolute), or why they cannot be: every name checked. */
export function fixtureLines(page: string, asked: RouteFixture): { readonly lines: FixtureLines } | { readonly problem: FileDiagnostic } {
  const file = routeFixtureOf(page);
  if (!existsSync(file)) return { problem: FUD1517({ file }) };
  const read = readFixtures(readFileSync(file, 'utf8'), file);
  const data = asked.data === undefined ? [] : typeof asked.data === 'string' ? [asked.data] : asked.data;
  const wanted: readonly (readonly ['data' | 'calls' | 'services', FixtureGroup | undefined, readonly string[]])[] = [
    ['data', read.data, data],
    ['calls', read.calls, asked.answers ?? []],
    ['services', read.services, asked.services === undefined ? [] : [asked.services]],
  ];
  for (const [group, have, names] of wanted) {
    const available = (have?.names ?? []).map((name) => name.text);
    const missing = names.find((name) => !available.includes(name));
    if (missing !== undefined) return { problem: FUD1516({ file, group, name: missing, available }) };
  }
  return {
    lines: {
      ...(data.length > 0 ? { fixture: data } : {}),
      ...(asked.answers !== undefined ? { answers: asked.answers } : {}),
      ...(asked.services !== undefined ? { services: asked.services } : {}),
    },
  };
}
