/**
 * Where each piece of the project is (SDD-77 §4.4): its phases, in order, read off the files, the
 * history and the project service. Nothing is run: a test or a criterion counts as its last run
 * in the history, and a run that is not of the piece as it is now counts as none.
 */

import { existsSync, readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { nodeIo, unitState, type UnitState } from '@fudic/history';
import type { Piece, ProjectService } from '@fudic/language-server/project';
import type { Cli } from './fudic.js';

/** The phases of a piece, in the order they are done. */
export const PHASES = ['criteria', 'api', 'red', 'view', 'connect', 'document', 'showcase', 'done'] as const;
export type Phase = (typeof PHASES)[number];

/** A piece as `fudic_status` lists it. */
export interface Unit {
  /** Relative to the project. */
  readonly piece: string;
  readonly kind: Piece['kind'];
  readonly name: string;
  /** The first phase not finished; `done` once the history says so. */
  readonly phase: Phase;
  /** Every phase but `done` is finished, and the history does not say `done` yet. */
  readonly complete: boolean;
  readonly approval: UnitState['approval'];
  readonly server: boolean;
  readonly tests: string;
  readonly spec: string;
  readonly documented: string;
  readonly functions: { readonly connected: number; readonly missing: number };
  /** The functions of its `.fudapi` with a handler: what a `connected` line names. */
  readonly connectedFunctions: readonly string[];
  /** The `<id>` of the `.fudapi` it links, or should link. */
  readonly api?: string;
}

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** A run as a person reads it: `pass 6/6`, `red 0/6`, `stale (was pass)`, `not run`. */
function runText(run: UnitState['tests'] | UnitState['spec']): string {
  if (run.state === 'not run') return 'not run';
  if (run.state === 'stale') return `stale (was ${run.last})`;
  return `${run.state} ${run.passed}/${run.total}`;
}

/** Whether the project is a library: it has no server of its own. */
export function isLibrary(root: string): boolean {
  try {
    return (JSON.parse(readFileSync(`${root}/fudic.json`, 'utf8')) as { kind?: unknown }).kind === 'lib';
  } catch {
    return false; // without a readable fudic.json, an app: what `fudic new` makes
  }
}

/** What reading the phases needs: the history of a piece. Injected by the tests. */
export type StateOf = (file: string) => Promise<UnitState>;

/** The app a workspace shows its libraries in, unless `--app` names another. */
const SHOWCASE_APP = 'apps/showcase';

/**
 * Whether the showcase of the library at `root` is current: `fudic g showcase <library>` would
 * change nothing. True where there is no showcase to keep: an app, or a library whose workspace
 * has none.
 */
export async function showcaseCurrent(root: string, cli: Cli): Promise<boolean> {
  if (!isLibrary(root)) return true;
  const io = cli.nodeReadIo();
  const workspace = cli.workspaceRoot(root, io);
  if (workspace === null || !existsSync(`${workspace}/${SHOWCASE_APP}`)) return true;
  const library = cli.findProjects(workspace, io).find((p) => posix(p.path) === posix(root));
  if (library === undefined) return true;
  const command = cli.parseArgs(['g', 'showcase', library.name, '--cwd', workspace]);
  // The parser answers a plan for `g showcase <name>`; the narrow is for the type.
  /* v8 ignore next */
  if (command.kind === 'error' || command.kind === 'help' || command.kind === 'serve' || command.kind === 'history') return false;
  const plan = await cli.planOf(command, { readIo: io, writeIo: cli.nodeWriteIo(), runner: { run: () => 0 }, streams: { out: () => undefined, err: () => undefined } });
  return plan.errors.length === 0 && plan.changes.length === 0 && (plan.deletions ?? []).length === 0;
}

/** Each piece of the project with its phase, in the order of its files. */
export async function unitsOf(
  root: string,
  service: ProjectService,
  options: { readonly showcase: boolean; readonly stateOf?: StateOf },
): Promise<readonly Unit[]> {
  const read = options.stateOf ?? ((file: string) => unitState(file, nodeIo(root)));
  const library = isLibrary(root);
  const units: Unit[] = [];
  for (const piece of service.pieces()) {
    const state = await read(piece.file);
    const stem = piece.file.slice(0, -'.fud'.length);
    const api = piece.sibling ?? piece.servers[0];
    const server = !library && api !== undefined;
    const handlers = server ? piece.servers.flatMap((id) => service.handlers(id) ?? []) : [];
    const connected = handlers.filter((h) => h.state === 'connected');
    const { tests, spec } = state;
    const done: Record<Phase, boolean> = {
      criteria: existsSync(`${stem}.fudspec`) && state.approval === 'valid',
      api: !server || (piece.sibling === undefined ? piece.servers.length > 0 : piece.servers.includes(piece.sibling)),
      // Red for the right reason, and of the piece as it is: a broken test is not red.
      red:
        existsSync(`${stem}.test.ts`) &&
        (tests.state === 'red' || tests.state === 'pass') &&
        (spec.state === 'fail' || spec.state === 'pass'),
      view: tests.state === 'pass' && spec.state === 'pass',
      connect: !server || (handlers.length > 0 && connected.length === handlers.length),
      document: piece.kind === 'route' || (piece.documented.doc && piece.documented.documented === piece.documented.props),
      // A library's page of its components, which `fudic g showcase` keeps current.
      showcase: piece.kind === 'route' || options.showcase,
      done: state.done,
    };
    const open = PHASES.find((phase) => phase !== 'done' && !done[phase]);
    units.push({
      piece: posix(relative(root, piece.file)),
      kind: piece.kind,
      name: piece.name,
      phase: state.done ? 'done' : (open ?? 'done'),
      complete: open === undefined && !state.done,
      approval: state.approval,
      server,
      tests: runText(tests),
      spec: runText(spec),
      documented: `${piece.documented.documented}/${piece.documented.props}`,
      functions: { connected: connected.length, missing: handlers.length - connected.length },
      connectedFunctions: connected.map((h) => h.name),
      ...(api !== undefined ? { api } : {}),
    });
  }
  return units;
}
