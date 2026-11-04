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
import { projectsOf } from './project.js';

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
  /** The projects under the server's folder. By default, as they are on disk. */
  readonly projects: (root: string) => readonly string[];
}

const nodeChecksDeps: ChecksDeps = { load: loadFudic, stamps: stampsOf, projects: projectsOf };

/** One project's checker: in a workspace, one per app and library, as each builds on its own. */
interface Checked {
  readonly folder: string;
  readonly fudic: Fudic;
  readonly checker: ProjectChecker;
}

interface Mounted {
  /** The fudic of the server's folder: its CLI is the one that plans. */
  readonly fudic: Fudic;
  readonly checked: readonly Checked[];
  readonly service: ProjectService;
}

/** The reports of every project as one, in the order of the projects: path order. */
function merged(reports: readonly CheckReport[]): CheckReport {
  return {
    problems: reports.flatMap((r) => r.problems),
    project: reports.flatMap((r) => r.project),
    inputs: reports.flatMap((r) => r.inputs),
  };
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
    const { checked, service } = await this.#mount();
    // The types of `fudic:<id>`, as the build writes them before it checks.
    for (const { fudic, folder } of checked) fudic.writeApiDeclarations(folder);
    const now = this.#deps.stamps(this.#root);
    const changed = [...now].filter(([path, date]) => this.#stamps.get(path) !== date).map(([path]) => path);
    const gone = [...this.#stamps.keys()].filter((path) => !now.has(path));
    for (const path of [...changed, ...gone]) {
      for (const { checker } of checked) checker.invalidate(path);
      service.invalidate(path);
    }
    this.#stamps = now;
    return merged(checked.map(({ checker }) => checker.check()));
  }

  /** The folders checked: the server's, or each project of its workspace. */
  async folders(): Promise<readonly string[]> {
    return (await this.#mount()).checked.map((c) => c.folder);
  }

  /** Forget the checker and the fudic it was made with: the next call mounts them again. */
  reset(): void {
    this.#mounted = undefined;
    this.#stamps = new Map();
  }

  /** The editor's project service, kept current by every check. */
  async service(): Promise<ProjectService> {
    return (await this.#mount()).service;
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
    this.#mounted ??= (async () => {
      const fudic = await this.#deps.load(this.#root);
      const checked: Checked[] = [];
      for (const folder of this.#deps.projects(this.#root)) {
        // Each project with the fudic it installed; the server's folder is loaded once.
        const own = folder === this.#root ? fudic : await this.#deps.load(folder);
        checked.push({ folder, fudic: own, checker: own.createProjectChecker({ root: folder }) });
      }
      // The service asks a check's own TypeScript: one program, and the types the build sees.
      // In a workspace, the first project's: the service reads them all, a program sees one.
      const service = openProject(this.#root, { typescript: () => checked[0]?.checker.languageService?.() });
      return { fudic, checked, service };
    })();
    return this.#mounted;
  }
}
