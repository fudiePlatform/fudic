/**
 * The plan of a workbench: one generated page per criterion, mounting the component alone with
 * the props of its fixture, plus the steps each criterion runs. Pure: it takes the parsed
 * `.fudspec` and the EXECUTED fixture, and answers file contents; writing them is the session's.
 *
 * A page carries nothing of the workbench — no script, no style, no attribute. What the engine
 * observes goes in through the browser, into its own instance only.
 */

import { FUD0972, FUD0974, type FudDiagnostic } from '@fudic/diagnostics';
import { normalizeTerm, type Arg, type BlockKind, type Criterion, type SpecFile } from '@fudic/spec';
import { hostComponent, isSignal, jsonLiteral } from './host.js';
import type { BenchTarget } from './target.js';

export interface PlannedStep {
  readonly block: BlockKind;
  /** The term, normalized to its file name. */
  readonly term: string;
  /** As written; `role:x/"n"` included, a string without its quotes. */
  readonly args: readonly string[];
}

export interface PlannedCriterion {
  /** The criterion's slug. */
  readonly id: string;
  /** `/<tag>/<slug>`. */
  readonly route: string;
  /** CSS of the element its page mounts (the component, or its `Signal` host): what is photographed. */
  readonly mount: string;
  /** The name in `props <name>`. */
  readonly fixture: string | null;
  readonly steps: readonly PlannedStep[];
  /** Present when the criterion cannot run: it ends in error without opening its page. */
  readonly error?: string;
}

export interface BenchPlan {
  readonly criteria: readonly PlannedCriterion[];
  /** File name relative to the workbench folder → content. */
  readonly files: ReadonlyMap<string, string>;
  readonly diagnostics: readonly FudDiagnostic[];
}

export type ExecutedFixtures = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export interface PlanInput {
  readonly target: BenchTarget;
  /** Ignored when `target.spec` is null: the component opens bare, on one card. */
  readonly spec: SpecFile;
  /** The executed fixture; empty without one. */
  readonly fixtures: ExecutedFixtures;
  /** The workbench folder, absolute: a `Signal` host page links its host from there. */
  readonly dir: string;
}

/** The one line that is not a step: it names the fixture entry the page mounts with. */
const PROPS = 'props';

/** The folder, relative to the project root, that holds one workbench per process. */
export const BENCH_FOLDER = 'node_modules/.fudic-bench';

/**
 * Where a process keeps its pages: inside the project, out of git and the watcher, and its own.
 * Keyed by process and not by tag: two workbenches on one component must not share a folder,
 * since each empties it when it starts and deletes it when it closes.
 */
export function benchDir(projectRoot: string, pid: number = process.pid): string {
  return `${projectRoot.replace(/\/+$/u, '')}/${BENCH_FOLDER}/${pid}`;
}

/** `routesDir` of the workbench's Vite, relative to the project root as the plugin reads it. */
export function benchRoutesDir(pid: number = process.pid): string {
  return `${BENCH_FOLDER}/${pid}/routes`;
}

/**
 * The component's bare page, `/<tag>`: no props, no steps. It is written before Vite starts, so
 * the plugin finds the component from its first look; and it cannot collide with a criterion,
 * whose pages live one level down, at `/<tag>/<slug>`.
 */
export function mountFiles(target: BenchTarget): ReadonlyMap<string, string> {
  return new Map([[`routes/${target.tag}.fud`, pageSource(target.tag, target.tag, bare(target))]]);
}

export function planBench(input: PlanInput): BenchPlan {
  const { target } = input;
  const files = new Map(mountFiles(target));
  const diagnostics: FudDiagnostic[] = [];
  const planner = new Planner(target, input.fixtures, input.dir, files, diagnostics);

  const criteria: PlannedCriterion[] = [];
  if (target.spec === null) {
    diagnostics.push(FUD0972({ file: target.component }));
    criteria.push(planner.plan(target.tag, null, []));
  } else {
    for (const criterion of input.spec.criteria) {
      if (criterion.slug === undefined) continue;
      const { fixture, steps } = readCriterion(criterion);
      criteria.push(planner.plan(criterion.slug.text, fixture, steps));
    }
  }
  return { criteria, files, diagnostics };
}

function readCriterion(criterion: Criterion): { fixture: string | null; steps: PlannedStep[] } {
  let fixture: string | null = null;
  const steps: PlannedStep[] = [];
  for (const block of criterion.blocks) {
    for (const line of block.terms) {
      const args = line.args.map(written);
      if (line.name.text === PROPS) fixture = args[0] ?? null;
      else steps.push({ block: block.block, term: normalizeTerm(line.name.text), args });
    }
  }
  return { fixture, steps };
}

function written(arg: Arg): string {
  if (arg.kind !== 'role') return arg.text;
  return `role:${arg.role.text}` + (arg.name === undefined ? '' : `/"${arg.name.text}"`);
}

/** What a page mounts: the component (or its host), with the code and attributes of its props. */
interface Mount {
  readonly href: string;
  readonly tag: string;
  readonly code: string;
  readonly attrs: string;
}

/** The component alone, without props. */
function bare(target: BenchTarget): Mount {
  return { href: target.component, tag: target.tag, code: '', attrs: '' };
}

function pageSource(tag: string, title: string, mount: Mount): string {
  return (
    '<!DOCTYPE html>\n<html>\n  <head>\n' +
    `    <link rel="component" href="${mount.href}">\n` +
    mount.code +
    '    <script type="module" src="fudic:runtime"></script>\n' +
    `    <title>${tag} · ${title}</title>\n` +
    '  </head>\n  <body>\n' +
    `    <${mount.tag}${mount.attrs}></${mount.tag}>\n` +
    '  </body>\n</html>\n'
  );
}

/** Writes the page (and the host, when it needs one) of each criterion. */
class Planner {
  constructor(
    private readonly target: BenchTarget,
    private readonly fixtures: ExecutedFixtures,
    private readonly dir: string,
    private readonly files: Map<string, string>,
    private readonly diagnostics: FudDiagnostic[],
  ) {}

  plan(id: string, fixture: string | null, steps: readonly PlannedStep[]): PlannedCriterion {
    const base = { id, route: `/${this.target.tag}/${id}`, mount: `body > ${this.target.tag}`, fixture, steps };
    const component = this.target.component;
    if (fixture === null) {
      this.page(id, bare(this.target));
      return base;
    }

    const values = this.fixtures[fixture];
    const file = this.target.fixture;
    if (values === undefined || file === null) {
      return { ...base, error: `the fixture has no entry "${fixture}"` };
    }
    const specifier = file.replace(/\.ts$/u, '');
    const order = Object.keys(values);
    const signals = order.filter((prop) => isSignal(values[prop]));

    if (signals.length === 0) {
      const code =
        order.length === 0
          ? ''
          : `    @code {\n      import fixtures from "${specifier}";\n` +
            `      const { ${order.join(', ')} } = fixtures["${fixture}"];\n    }\n`;
      const attrs = order.map((prop) => ` .${prop}=@${prop}`).join('');
      this.page(id, { href: component, tag: this.target.tag, code, attrs });
      return base;
    }

    const literals: { prop: string; literal: string }[] = [];
    for (const prop of signals) {
      const literal = jsonLiteral((values[prop] as () => unknown)());
      if (literal === undefined) {
        this.diagnostics.push(FUD0974({ file, fixture, prop }));
        return { ...base, error: `the initial value of signal prop "${prop}" is not a JSON literal` };
      }
      literals.push({ prop, literal });
    }
    // The component's tag in the host's: one Vite compiles the hosts of every open component.
    const hostTag = `bench-host-${this.target.tag}-${id}`;
    const hostFile = `components/${this.target.tag}/${hostTag}.fud`;
    this.files.set(
      hostFile,
      hostComponent({
        tag: hostTag,
        component,
        componentTag: this.target.tag,
        fixture: { specifier, name: fixture },
        signals: literals,
        forwarded: order.filter((prop) => !signals.includes(prop)),
        order,
      }),
    );
    this.page(id, { href: `${this.dir}/${hostFile}`, tag: hostTag, code: '', attrs: '' });
    return { ...base, mount: `body > ${hostTag}` };
  }

  private page(id: string, mount: Mount): void {
    this.files.set(`routes/${this.target.tag}/${id}.fud`, pageSource(this.target.tag, id, mount));
  }
}
