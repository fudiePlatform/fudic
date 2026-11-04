/**
 * The project check, as the server keeps it: one checker for as long as the server lives, told
 * which files changed before every check, and the editor's project service beside it for the
 * repairs. The files are compared by date, so what the agent wrote with its own tools — over
 * stdio it has them — is seen as what this server writes.
 */

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceDiagnostic } from '@fudic/diagnostics';
import { openProject, type ProjectService, type Repair } from '@fudic/language-server/project';
import type { CheckProblem, CheckReport, ProjectChecker } from '@fudic/typecheck';
import { loadFudic, type Fudic } from './fudic.js';

/** The date of every file of the project, by absolute path. */
export type Stamps = ReadonlyMap<string, number>;

/** Folders whose files never change what a check says, or that the build owns. */
const SKIPPED: ReadonlySet<string> = new Set(['node_modules', 'dist', '.git']);

/** Every file under `root`, with its date. */
export function stampsOf(root: string): Stamps {
  const out = new Map<string, number>();
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) out.set(path, statSync(path).mtimeMs);
    }
  };
  visit(root);
  return out;
}

export interface ChecksDeps {
  readonly load: (root: string) => Promise<Fudic>;
  readonly stamps: (root: string) => Stamps;
}

const nodeChecksDeps: ChecksDeps = { load: loadFudic, stamps: stampsOf };

interface Mounted {
  readonly fudic: Fudic;
  readonly checker: ProjectChecker;
  readonly service: ProjectService;
}

export class Checks {
  readonly #root: string;
  readonly #deps: ChecksDeps;
  #mounted: Promise<Mounted> | undefined;
  #stamps: Stamps = new Map();

  constructor(root: string, deps: ChecksDeps = nodeChecksDeps) {
    this.#root = root;
    this.#deps = deps;
  }

  /** Check the project, as its build would before compiling anything. */
  async run(): Promise<CheckReport> {
    const { fudic, checker, service } = await this.#mount();
    // The types of `fudic:<id>`, as the build writes them before it checks.
    fudic.writeApiDeclarations(this.#root);
    const now = this.#deps.stamps(this.#root);
    const changed = [...now].filter(([path, date]) => this.#stamps.get(path) !== date).map(([path]) => path);
    const gone = [...this.#stamps.keys()].filter((path) => !now.has(path));
    for (const path of [...changed, ...gone]) {
      checker.invalidate(path);
      service.invalidate(path);
    }
    this.#stamps = now;
    return checker.check();
  }

  /** The fudic the project answers with: its checker's, its CLI. */
  async fudic(): Promise<Fudic> {
    return (await this.#mount()).fudic;
  }

  /** The repairs the editor offers for one problem of the last check; none for TypeScript's. */
  async repairs(problem: CheckProblem): Promise<readonly Repair[]> {
    if (!problem.code.startsWith('FUD')) return [];
    const { service } = await this.#mount();
    return service.repairs(problem.file, problem as SourceDiagnostic);
  }

  #mount(): Promise<Mounted> {
    this.#mounted ??= this.#deps.load(this.#root).then((fudic) => {
      const checker = fudic.createProjectChecker({ root: this.#root });
      // The service asks the check's own TypeScript: one program, and the types the build sees.
      const service = openProject(this.#root, { typescript: () => checker.languageService?.() });
      return { fudic, checker, service };
    });
    return this.#mounted;
  }
}
