/**
 * `fudic approve`, `fudic accept` and `fudic history`: the history of a piece from the terminal.
 * The two that write are plans like every other — the line is a change of the `.fudlog`, the tag
 * a command — so `--dry-run` and `--json` show them before anything happens.
 */

import { userInfo } from 'node:os';
import { CONFIG_FILE } from '@fudic/config';
import { ROUTES_DIR } from '@fudic/conventions';
import { FUD1221, FUD1222 } from '@fudic/diagnostics';
import {
  appendix,
  approvalHash,
  git,
  historyLine,
  historyOf,
  nodeIo,
  type HistoryEvent,
  type HistoryIo,
  type UnitState,
  unitState,
} from '@fudic/history';
import { SPEC_EXTENSION, parseSpec } from '@fudic/spec';
import { tagOf } from '@fudic/typecheck';
import { nodeReadIo, type ReadIo } from '../io.js';
import { parseFud } from '../parse.js';
import { absolute, relativeTo, toPosix } from '../paths.js';
import { nearestWith } from '../workspace/discover.js';
import type { BaseOptions, CliError, FileChange, Plan } from '../types.js';

/** The world the history commands ask: the clock, git and the user. Injected by the tests. */
export interface HistoryDeps {
  now(): Date;
  git(cwd: string, args: readonly string[]): Promise<string | undefined>;
  /** Who runs the command when git does not say: the user of the system. */
  user(): string;
}

export const nodeHistoryDeps = (): HistoryDeps => ({ now: () => new Date(), git, user: () => userInfo().username });

/** A component or a route: its `.fud` and the project it belongs to, absolute and with `/`. */
export interface Piece {
  readonly root: string;
  readonly unit: string;
  /** How it is named in a tag and in `fudic history`: the component's tag, or the route. */
  readonly name: string;
}

export interface PieceResolution {
  readonly piece?: Piece;
  readonly errors: readonly CliError[];
}

const failed = (...errors: CliError[]): PieceResolution => ({ errors });

/** The `.fud` a folder stands for: the one named after it, or a route's `index.fud`. */
function fudOf(path: string, io: ReadIo): string | undefined {
  if (!io.isDirectory(path)) return path;
  const name = path.slice(path.lastIndexOf('/') + 1);
  return [`${path}/${name}.fud`, `${path}/index.fud`].find((candidate) => io.exists(candidate));
}

/** What `<piece>` names: a `.fud` or its folder, of a component or of a route. */
export function findPiece(written: string, cwd: string, io: ReadIo): PieceResolution {
  const unit = fudOf(toPosix(absolute(cwd, written)), io);
  if (unit === undefined || !unit.endsWith('.fud') || !io.exists(unit)) return failed(FUD1221({ file: written }));
  const root = nearestWith(unit.slice(0, unit.lastIndexOf('/')), CONFIG_FILE, io);
  // Outside a project there are no components nor routes.
  if (root === null) return failed(FUD1221({ file: written }));
  const inProject = relativeTo(root, unit);
  if (inProject.startsWith(`${ROUTES_DIR}/`)) {
    const route = inProject.slice(ROUTES_DIR.length + 1, -'.fud'.length).replace(/(?:^|\/)index$/u, '');
    return { piece: { root, unit, name: route === '' ? 'index' : route }, errors: [] };
  }
  const tag = tagOf(parseFud(io.read(unit)).doc);
  // A layout or a file of snippets is a `.fud` and no piece: neither has a tag of its own.
  if (tag === '') return failed(FUD1221({ file: written }));
  return { piece: { root, unit, name: tag }, errors: [] };
}

/** The history's port over the CLI's reads: what a test hands the CLI is what the history reads. */
export function historyIo(root: string, io: ReadIo, deps: HistoryDeps): HistoryIo {
  const disk = nodeIo(root);
  return {
    ...disk,
    fs: { ...disk.fs, readFile: (path) => (io.exists(path) && !io.isDirectory(path) ? io.read(path) : undefined) },
    now: () => deps.now(),
    head: () => deps.git(root, ['rev-parse', '--verify', '--quiet', 'HEAD']),
  };
}

/** Who acts: git's `user.name`, else the user of the system. */
async function personOf(root: string, deps: HistoryDeps): Promise<string> {
  const name = await deps.git(root, ['config', 'user.name']);
  return name ?? deps.user();
}

/** The plan of one line appended to a piece's history. */
async function appendLine(piece: Piece, event: HistoryEvent, opts: BaseOptions, io: ReadIo, history: HistoryIo): Promise<FileChange> {
  const file = historyOf(piece.unit);
  const before = io.exists(file) ? io.read(file) : undefined;
  const contents = `${before ?? ''}${appendix(before, await historyLine(event, history))}`;
  const path = relativeTo(absolute(opts.cwd, '.'), file);
  return before === undefined ? { kind: 'create', path, contents } : { kind: 'modify', path, contents, before };
}

const refused = (errors: readonly CliError[]): Plan => ({ changes: [], commands: [], diagnostics: [], errors });

/** `fudic approve <piece>`: an `approved` line with the person, the criteria and the hash of now. */
export async function planApprove(
  written: string,
  opts: BaseOptions,
  io: ReadIo = nodeReadIo(),
  deps: HistoryDeps = nodeHistoryDeps(),
): Promise<Plan> {
  const { piece, errors } = findPiece(written, opts.cwd, io);
  if (piece === undefined) return refused(errors);
  const spec = `${piece.unit.slice(0, -'.fud'.length)}${SPEC_EXTENSION}`;
  if (!io.exists(spec)) return refused([FUD1222({ file: relativeTo(absolute(opts.cwd, '.'), piece.unit) })]);

  const history = historyIo(piece.root, io, deps);
  const event: HistoryEvent = {
    kind: 'approved',
    by: await personOf(piece.root, deps),
    criteria: parseSpec(io.read(spec)).value.criteria.length,
    hash: await approvalHash(piece.unit, history),
  };
  return { changes: [await appendLine(piece, event, opts, io, history)], commands: [], diagnostics: [], errors: [] };
}

/** What git does not take in a tag name. */
const NOT_IN_A_TAG = /[\s~^:?*[\]\\]+/gu;

/** `fudic accept <piece> "<text>"`: an `accepted` line and the tag `accepted/<name>/<date>` on `HEAD`. */
export async function planAccept(
  written: string,
  text: string,
  opts: BaseOptions,
  io: ReadIo = nodeReadIo(),
  deps: HistoryDeps = nodeHistoryDeps(),
): Promise<Plan> {
  const { piece, errors } = findPiece(written, opts.cwd, io);
  if (piece === undefined) return refused(errors);

  const base = `accepted/${piece.name.replace(NOT_IN_A_TAG, '-')}/${deps.now().toISOString().slice(0, 10)}`;
  const taken = new Set((await deps.git(piece.root, ['tag', '--list', `${base}*`]))?.split('\n') ?? []);
  let tag = base;
  for (let n = 2; taken.has(tag); n += 1) tag = `${base}-${n}`;

  const history = historyIo(piece.root, io, deps);
  const event: HistoryEvent = { kind: 'accepted', by: await personOf(piece.root, deps), text, tag };
  return {
    changes: [await appendLine(piece, event, opts, io, history)],
    commands: [{ command: 'git', args: ['tag', tag], dir: relativeTo(absolute(opts.cwd, '.'), piece.root) }],
    diagnostics: [],
    errors: [],
  };
}

/** A run, for a person: `pass 6/6`, `stale (was pass)`, `not run`. */
function runText(run: UnitState['tests']): string {
  if (run.state === 'not run') return 'not run';
  if (run.state === 'stale') return `stale (was ${run.last})`;
  return `${run.state} ${run.passed}/${run.total}`;
}

/** `fudic history`'s line: `acme-button  approved by pedro (valid) · tests pass 6/6 · spec pass 4/4 · done`. */
export function describeState(name: string, state: UnitState): string {
  const approved = state.lines.findLast((line) => line.event.kind === 'approved')?.event;
  const parts = [
    approved?.kind === 'approved' && state.approval !== 'none' ? `approved by ${approved.by} (${state.approval})` : 'not approved',
    `tests ${runText(state.tests)}`,
    `spec ${runText(state.spec)}`,
    ...(state.look === 'none' ? [] : [`look (${state.look})`]),
    ...(state.done ? ['done'] : []),
    ...(state.accepted === undefined ? [] : [`accepted ${state.accepted.tag}`]),
  ];
  return `${name}  ${parts.join(' · ')}`;
}

/** What `fudic history` shows: the piece's name, its state and its `.fudlog`, or why there is none. */
export type PieceState =
  | { readonly found: true; readonly name: string; readonly state: UnitState; readonly log: string }
  | { readonly found: false; readonly errors: readonly CliError[] };

export async function pieceState(
  written: string,
  opts: BaseOptions,
  io: ReadIo = nodeReadIo(),
  deps: HistoryDeps = nodeHistoryDeps(),
): Promise<PieceState> {
  const { piece, errors } = findPiece(written, opts.cwd, io);
  if (piece === undefined) return { found: false, errors };
  const state = await unitState(piece.unit, historyIo(piece.root, io, deps));
  return { found: true, name: piece.name, state, log: historyOf(piece.unit) };
}
