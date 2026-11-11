/**
 * `record` (SDD-82 §3.9): what the real server answered a page's or a flow's criteria, written
 * into their fixture, and their `.fudspec` changed to name it. The criteria have just run against
 * the real server, without `data` or `answers`, and their bench kept every real answer.
 *
 * - a page: each `data` its route asked for, as `<criterion>`, `<criterion>-2`, …, in order;
 * - both: what each function or remote rule answered, in `calls['<criterion>']` — the last
 *   answer when it was called more than once, as `answers` reads it;
 * - a `File`, as `file('./fixtures/<criterion>/<name>')`, its bytes beside the fixture.
 *
 * Only a criterion that passed is recorded: one that did not would freeze what was wrong. A value
 * with no literal is `FUD1515` and left out — the criterion runs that part for real — and a
 * `data` after it is left out too, since the next ones are named in order. What already has a
 * name is replaced.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { FUD1515, type FudDiagnostic } from '@fudic/diagnostics';
import {
  emptyFixture,
  FIXTURE_EXTENSION,
  fixtureKindOf,
  isLiteral,
  literalOf,
  recordFixture,
  recordLines,
  SPEC_EXTENSION,
  type Helper,
  type Literal,
  type RecordedEntry,
} from '@fudic/spec';
import type { Recorded } from '@fudic/vite';
import { routeId } from './app-plan.js';
import { CALL_TIMEOUT } from './browser.js';
import type { CriterionResult } from './engine.js';
import type { BenchTarget } from './target.js';

/** What was written of one criterion. */
export interface RecordedCriterion {
  /** The `.fudspec`, absolute. */
  readonly spec: string;
  readonly id: string;
  /** The `data` it names now, in order: empty for a flow, or when its route asked for none. */
  readonly data: readonly string[];
  /** The functions and remote rules answered in `calls['<id>']`. */
  readonly calls: readonly string[];
}

/** A criterion that was not recorded, and why. */
export interface SkippedCriterion {
  readonly spec: string;
  readonly id: string;
  readonly reason: string;
}

export interface Recording {
  readonly recorded: readonly RecordedCriterion[];
  readonly skipped: readonly SkippedCriterion[];
  /** `FUD1515` of each value left out; `FUD1510` of a fixture it could not write into. */
  readonly diagnostics: readonly FudDiagnostic[];
}

/** What a data request that never settled leaves in its place. */
const UNSETTLED = Symbol('unsettled');

/** A data value, or `UNSETTLED` once the time of a call is up. */
function settle(value: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise((resolve) => {
    timer = setTimeout(() => resolve(UNSETTLED), ms);
  });
  return Promise.race([value, late]).finally(() => clearTimeout(timer));
}

/** The fixture a page's or a flow's `.fudspec` reads: there or not. */
const fixturePathOf = (target: BenchTarget): string => target.fixture ?? (target.spec as string).slice(0, -SPEC_EXTENSION.length) + FIXTURE_EXTENSION;

const read = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
};

/** Writes `bytes` at `path`, its folders made. */
function write(path: string, bytes: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

/** `value` with every `File` in it written under `./fixtures/<id>/` and replaced by its `file(…)` marker. */
async function withFiles(value: unknown, dir: string, id: string): Promise<unknown> {
  if (value instanceof File) {
    const relative = `./fixtures/${id}/${value.name}`;
    write(`${dir}/${relative.slice(2)}`, new Uint8Array(await value.arrayBuffer()));
    return { $file: relative, ...(value.type !== '' ? { type: value.type } : {}) };
  }
  if (Array.isArray(value)) return Promise.all(value.map((item) => withFiles(item, dir, id)));
  if (typeof value !== 'object' || value === null || Object.getPrototypeOf(value) !== Object.prototype) return value;
  const entries = await Promise.all(Object.entries(value).map(async ([key, item]) => [key, await withFiles(item, dir, id)] as const));
  return Object.fromEntries(entries);
}

/** The indentation of an entry of a group, and of what is inside it. */
const ENTRY = '    ';

/**
 * Writes what the criteria of `target` that recorded were answered. `ms` is how long a data
 * request that has not settled is waited for.
 */
export async function writeRecording(target: BenchTarget, results: readonly CriterionResult[], ms: number = CALL_TIMEOUT): Promise<Recording> {
  const spec = target.spec as string;
  const fixture = fixturePathOf(target);
  const dir = dirname(fixture);
  const route = target.kind === 'page' ? routeId(target.component, target.projectRoot) : undefined;
  const recorded: RecordedCriterion[] = [];
  const skipped: SkippedCriterion[] = [];
  const diagnostics: FudDiagnostic[] = [];
  let fixtureText = read(fixture) ?? emptyFixture(fixtureKindOf(target.kind as 'page' | 'flow', route));
  let specText = read(spec) ?? '';
  let changed = false;

  for (const result of results) {
    if (result.recorded === undefined) continue;
    const id = result.id;
    if (result.verdict !== 'pass') {
      skipped.push({ spec, id, reason: `it did not pass (${result.verdict})` });
      continue;
    }
    const entries: RecordedEntry[] = [];
    const helpers = new Set<Helper>();
    const leftOut = (at: string, found: string) => diagnostics.push(FUD1515({ file: fixture, at, found }));

    // The data of the page's route, in order, up to the first one that cannot be written.
    const data: string[] = [];
    const asked = result.recorded.filter((e): e is Extract<Recorded, { kind: 'data' }> => e.kind === 'data' && e.route === route);
    for (const [i, entry] of asked.entries()) {
      const name = i === 0 ? id : `${id}-${i + 1}`;
      const value = await settle(entry.value, ms);
      if (value === UNSETTLED) {
        leftOut(`data.${name}`, 'an answer that never settled');
        break;
      }
      const written = literalOf(await withFiles(value, dir, id), `data.${name}`, ENTRY);
      if (!isLiteral(written)) {
        leftOut(written.at, written.found);
        break;
      }
      data.push(name);
      for (const helper of written.helpers) helpers.add(helper);
      entries.push({ group: 'data', name, value: written.source });
    }

    // What each function answered last; one that cannot be written runs for real.
    const last = new Map<string, unknown>();
    for (const entry of result.recorded) if (entry.kind === 'call') last.set(entry.name, entry.value);
    const answered: Record<string, unknown> = {};
    for (const [name, value] of last) {
      const prepared = await withFiles(value, dir, id);
      const written = literalOf(prepared, `calls.${id}.${name}`);
      if (isLiteral(written)) answered[name] = prepared;
      else leftOut(written.at, written.found);
    }
    const calls = Object.keys(answered);
    if (calls.length > 0) {
      // Every value in it was written alone: the whole is written too.
      const written = literalOf(answered, `calls.${id}`, ENTRY) as Literal;
      for (const helper of written.helpers) helpers.add(helper);
      entries.push({ group: 'calls', name: id, value: written.source });
    }

    const out = recordFixture(fixtureText, fixture, entries, helpers);
    if ('problem' in out) {
      diagnostics.push(out.problem);
      skipped.push({ spec, id, reason: out.problem.message });
      continue;
    }
    fixtureText = out.source;
    specText = recordLines(specText, id, { ...(route !== undefined ? { data } : {}), ...(calls.length > 0 ? { answers: id } : {}) });
    changed = true;
    recorded.push({ spec, id, data, calls });
  }

  if (changed) {
    write(fixture, fixtureText);
    write(spec, specText);
  }
  return { recorded, skipped, diagnostics };
}
