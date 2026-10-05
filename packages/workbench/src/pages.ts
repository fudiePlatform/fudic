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
  /** `/<slug>`. */
  readonly route: string;
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
}

/** The one line that is not a step: it names the fixture entry the page mounts with. */
const PROPS = 'props';

/** The folder, relative to the project root, that holds one workbench per tag. */
export const BENCH_FOLDER = 'node_modules/.fudic-bench';

/** Where a project's workbench for a tag lives: inside the project, out of git and the watcher. */
export function benchDir(target: BenchTarget): string {
  return `${target.projectRoot.replace(/\/+$/u, '')}/${BENCH_FOLDER}/${target.tag}`;
}

export function planBench(input: PlanInput): BenchPlan {
  const { target } = input;
  const files = new Map<string, string>();
  const diagnostics: FudDiagnostic[] = [];
  const planner = new Planner(target, input.fixtures, files, diagnostics);

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

/** Writes the page (and the host, when it needs one) of each criterion. */
class Planner {
  constructor(
    private readonly target: BenchTarget,
    private readonly fixtures: ExecutedFixtures,
    private readonly files: Map<string, string>,
    private readonly diagnostics: FudDiagnostic[],
  ) {}

  plan(id: string, fixture: string | null, steps: readonly PlannedStep[]): PlannedCriterion {
    const base = { id, route: `/${id}`, fixture, steps };
    const component = this.target.component;
    if (fixture === null) {
      this.page(id, { href: component, tag: this.target.tag, code: '', attrs: '' });
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
    const hostTag = `bench-host-${id}`;
    const hostFile = `components/${hostTag}.fud`;
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
    this.page(id, { href: `${benchDir(this.target)}/${hostFile}`, tag: hostTag, code: '', attrs: '' });
    return base;
  }

  private page(id: string, mount: { href: string; tag: string; code: string; attrs: string }): void {
    this.files.set(
      `routes/${id}.fud`,
      '<!DOCTYPE html>\n<html>\n  <head>\n' +
        `    <link rel="component" href="${mount.href}">\n` +
        mount.code +
        '    <script type="module" src="fudic:runtime"></script>\n' +
        `    <title>${this.target.tag} · ${id}</title>\n` +
        '  </head>\n  <body>\n' +
        `    <${mount.tag}${mount.attrs}></${mount.tag}>\n` +
        '  </body>\n</html>\n',
    );
  }
}
