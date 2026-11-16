/**
 * The `diagnostics` of a `fudic.json`: how this project reports each code, and which project a
 * file obeys — the nearest `fudic.json` at or above it.
 *
 * A malformed `diagnostics` is `FUD0725`, like any other field. A key that names a code fudic
 * does not have (`FUD1520`), or one that lowers an error (`FUD1521`), drops that one entry and
 * leaves the rest of the file standing: the author meant the other entries, and a project
 * without its configuration would be a bigger surprise than one entry that does nothing.
 */

import {
  codeInfo,
  FUD1520,
  FUD1521,
  type FileDiagnostic,
  type FudCode,
  type Policy,
  type PolicyLevel,
  type Span,
} from '@fudic/diagnostics';
import { CONFIG_FILE } from './constants.js';
import type { ConfigIo, ProjectConfig } from './read.js';

const LEVELS: ReadonlySet<string> = new Set(['off', 'hint', 'info', 'warning', 'error']);
const CODE = /^FUD\d{4}$/u;

/** What reading the field leaves: the policy, the shape problems, and the entries it dropped. */
export interface PolicyRead {
  readonly policy: Policy;
  /** Why the field is not an object of code to level: `FUD0725` with this reason. */
  readonly malformed?: string;
  /** `FUD1520` and `FUD1521`, each on its key. */
  readonly dropped: readonly FileDiagnostic[];
}

/**
 * Reads `diagnostics`. `keySpan` finds where a key of the object is written, for the diagnostic
 * of an entry it drops.
 */
export function readPolicy(value: unknown, keySpan: (key: string) => Span | undefined): PolicyRead {
  const empty: Policy = { codes: new Map() };
  if (value === undefined) return { policy: empty, dropped: [] };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { policy: empty, malformed: 'it is not an object', dropped: [] };
  }
  const codes = new Map<FudCode, PolicyLevel>();
  let warnings: PolicyLevel | undefined;
  const dropped: FileDiagnostic[] = [];
  for (const [key, level] of Object.entries(value)) {
    if (typeof level !== 'string' || !LEVELS.has(level)) {
      return { policy: empty, malformed: `"${key}" is ${JSON.stringify(level)}`, dropped: [] };
    }
    if (key === 'warnings') {
      warnings = level as PolicyLevel;
      continue;
    }
    if (!CODE.test(key)) {
      return { policy: empty, malformed: `"${key}" is neither a code ("FUD" and four digits) nor "warnings"`, dropped: [] };
    }
    const where = { file: CONFIG_FILE, ...spanOf(keySpan(key)) };
    const info = codeInfo(key);
    if (info === undefined || 'retired' in info) {
      dropped.push(
        FUD1520({ place: 'policy', code: key, ...where, ...(info === undefined ? {} : { replacedBy: info.replacedBy }) }),
      );
    } else if (info.severity === 'error' && level !== 'error') {
      dropped.push(FUD1521({ place: 'policy', code: info.code, level, ...where }));
    } else {
      codes.set(info.code, level as PolicyLevel);
    }
  }
  return { policy: warnings === undefined ? { codes } : { codes, warnings }, dropped };
}

function spanOf(span: Span | undefined): { readonly span?: Span } {
  return span === undefined ? {} : { span };
}

/** A project's folder and what its `fudic.json` declares; `config` null when it does not read. */
export interface ProjectAt {
  readonly root: string;
  readonly config: ProjectConfig | null;
}

/**
 * Which project each file obeys: the nearest `fudic.json` at or above it. Remembers every folder
 * it walked through, so a check over a thousand files reads each `fudic.json` once; `clear` after
 * one changes.
 */
export class ProjectPolicies {
  readonly #io: ConfigIo;
  readonly #read: (root: string) => ProjectConfig | null;
  readonly #byDir = new Map<string, ProjectAt | null>();

  constructor(io: ConfigIo, read: (root: string) => ProjectConfig | null) {
    this.#io = io;
    this.#read = read;
  }

  /** The project `file` belongs to, or null when no `fudic.json` is above it. */
  projectOf(file: string): ProjectAt | null {
    const visited: string[] = [];
    let dir = parentOf(file.replace(/\\/gu, '/'));
    let found: ProjectAt | null = null;
    while (dir !== undefined) {
      const cached = this.#byDir.get(dir);
      if (cached !== undefined) {
        found = cached;
        break;
      }
      visited.push(dir);
      if (this.#io.exists(`${dir}/${CONFIG_FILE}`)) {
        found = { root: dir, config: this.#read(dir) };
        break;
      }
      dir = parentOf(dir);
    }
    for (const seen of visited) this.#byDir.set(seen, found);
    return found;
  }

  /** The policy `file` obeys: its project's, or null when it has none (every code as it is). */
  policyOf(file: string): Policy | null {
    return this.projectOf(file)?.config?.diagnostics ?? null;
  }

  clear(): void {
    this.#byDir.clear();
  }
}

/** The folder above `path`, or undefined at the top. */
function parentOf(path: string): string | undefined {
  const at = path.lastIndexOf('/');
  return at <= 0 ? undefined : path.slice(0, at);
}
