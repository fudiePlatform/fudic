/**
 * The `baseline` of a `fudic.json` (SDD-83 §3.4): the level the project asks for, and the features
 * it uses knowingly above it.
 *
 * Absent, it is `widely`: a check that stays quiet by default is only used by whoever already knows
 * it exists. A malformed `baseline` is `FUD0725`, like any other field. An id of `allow` that is not a
 * web-features id is `FUD1527` and allows nothing; one that moved or was split is `FUD1527` too, and
 * allows what it became — the author meant that feature, and webstatus.dev renamed it.
 */

import {
  cutoff,
  describeTarget,
  feature,
  FIRST_YEAR,
  FLOOR,
  lastYear,
  needsNewer,
  type Target,
} from '@fudic/baseline/config';
import { FUD1525, FUD1527, type FileDiagnostic, type Span } from '@fudic/diagnostics';
import { CONFIG_FILE } from './constants.js';

/** What `baseline` declares, with its defaults filled. */
export interface BaselineConfig {
  readonly target: Target;
  /** The ids of `allow` that allow something, in written order. */
  readonly allow: readonly AllowedId[];
}

/** One id of `allow`, as written, and the features it allows: itself, or where it moved or split to. */
export interface AllowedId {
  readonly id: string;
  readonly features: readonly string[];
}

/** What a project that says nothing asks for. */
export const DEFAULT_BASELINE: BaselineConfig = { target: 'widely', allow: [] };

/** What reading the field leaves: the level, why it is malformed, and the `FUD1527` of `allow`. */
export interface BaselineRead {
  readonly baseline: BaselineConfig;
  /** Why the field is not a level nor `{ target, allow }`: `FUD0725` with this reason. */
  readonly malformed?: string;
  readonly dropped: readonly FileDiagnostic[];
}

/** Every feature a project allows, for the judge: the union of what each id allows. */
export function allowedFeatures(baseline: BaselineConfig): ReadonlySet<string> {
  return new Set(baseline.allow.flatMap((entry) => entry.features));
}

/** Reads `baseline`. `idSpan` finds where an id of `allow` is written, for its `FUD1527`. */
export function readBaseline(value: unknown, idSpan: (id: string) => Span | undefined): BaselineRead {
  const refuse = (malformed: string): BaselineRead => ({ baseline: DEFAULT_BASELINE, malformed, dropped: [] });
  if (value === undefined) return { baseline: DEFAULT_BASELINE, dropped: [] };
  if (typeof value === 'string' || typeof value === 'number') {
    const target = readTarget(value);
    return typeof target === 'object' ? refuse(target.reason) : { baseline: { target, allow: [] }, dropped: [] };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return refuse('it is neither a level nor an object');
  }
  const fields = value as Record<string, unknown>;
  const stray = Object.keys(fields).find((key) => key !== 'target' && key !== 'allow');
  if (stray !== undefined) return refuse(`"${stray}" is neither "target" nor "allow"`);
  const target = fields['target'] === undefined ? 'widely' : readTarget(fields['target']);
  if (typeof target === 'object') return refuse(`"target": ${target.reason}`);
  const ids = fields['allow'] ?? [];
  if (!Array.isArray(ids)) return refuse('"allow" is not an array');
  const wrong = (ids as unknown[]).find((id) => typeof id !== 'string');
  if (wrong !== undefined) return refuse(`"allow" holds ${JSON.stringify(wrong)}, which is not a feature id`);

  const allow: AllowedId[] = [];
  const dropped: FileDiagnostic[] = [];
  for (const id of ids as string[]) {
    const where = { file: CONFIG_FILE, ...spanOf(idSpan(id)) };
    const found = feature(id);
    if (found === undefined) {
      dropped.push(FUD1527({ id, ...where }));
    } else if (found.kind === 'feature') {
      allow.push({ id, features: [id] });
    } else {
      dropped.push(FUD1527({ id, kind: found.kind, to: found.to, ...where }));
      allow.push({ id, features: found.to });
    }
  }
  return { baseline: { target, allow }, dropped };
}

/**
 * `FUD1525` when the level cuts before the oldest browsers fudic itself runs in (SDD-83 §3.7): no
 * fudic page can promise what the project asks for. The only warning fudic causes on its own.
 */
export function floorWarning(baseline: BaselineConfig, span?: Span): FileDiagnostic | undefined {
  const asks = cutoff(baseline.target);
  if (asks >= FLOOR) return undefined;
  return FUD1525({
    file: CONFIG_FILE,
    ...spanOf(span),
    floor: FLOOR,
    features: needsNewer(asks),
    baseline: describeTarget(baseline.target),
    cutoff: asks,
  });
}

/** A level: `widely`, `newly`, or a whole year from 2015 to the data's. */
function readTarget(value: unknown): Target | { readonly reason: string } {
  if (value === 'widely' || value === 'newly') return value;
  const last = lastYear();
  if (typeof value === 'number' && Number.isInteger(value) && value >= FIRST_YEAR && value <= last) return value;
  return { reason: `${JSON.stringify(value)} is not "widely", "newly" or a year from ${FIRST_YEAR} to ${last}` };
}

function spanOf(span: Span | undefined): { readonly span?: Span } {
  return span === undefined ? {} : { span };
}
