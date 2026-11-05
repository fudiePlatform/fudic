/**
 * `fudic_look`: what the user approves when they approve how a component looks (SDD-78 §4.4).
 * Each case of its fixture, painted in the bench's browser as a criterion is, photographed, and
 * set beside the shot of the same case in the last look they approved. The shots are kept under
 * `.fudic/looks/<tag>/<lookHash>/`, out of git; the hash is of the files, so it does not expire
 * on another machine. Looking is not approving: only `fudic_record { event: "look" }` writes.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { FUD1207, FUD1404, FUD1405, FUD1420, FUD1421, FUD1426, FUD1428 } from '@fudic/diagnostics';
import { nodeIo, unitState } from '@fudic/history';
import type { Piece } from '@fudic/language-server/project';
import { toPosix } from '@fudic/typecheck';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { VIEW_META_KEY } from './apps.js';
import type { Checks } from './checks.js';
import type { Problem } from './diagnostics.js';
import { loadRunners, type Runners } from './fudic.js';
import { locate } from './locate.js';
import { lookHashOf } from './look-hash.js';
import { isFudicProject, projectOf, type Project } from './project.js';
import type { Answer } from './respond.js';
import type { RunQueue } from './runs.js';

/** Where the shots of every look are kept, relative to the project. */
export const LOOKS_DIR = '.fudic/looks';

/** The most images an answer carries; the rest are named by their path. */
export const MAX_IMAGES = 8;

/** The folder of the shots of `tag` at `hash`, absolute. */
export function lookDir(root: string, tag: string, hash: string): string {
  return join(root, LOOKS_DIR, tag, hash);
}

/** Whether there are shots of `tag` at `hash`: someone looked at the piece as its files are. */
export function looked(root: string, tag: string, hash: string): boolean {
  const dir = lookDir(root, tag, hash);
  return existsSync(dir) && readdirSync(dir).some((name) => name.endsWith('.png'));
}

export type Verdict = 'new' | 'same' | 'changed' | 'gone';

export interface LookInput {
  /** The component's `.fud`, or its folder, relative to the project. */
  readonly piece: string;
  readonly cases?: readonly string[];
}

export interface LookDeps {
  readonly runners: (root: string) => Promise<Runners>;
}

const nodeLookDeps: LookDeps = { runners: (root) => loadRunners(root) };

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** The `.fud` a piece names: the file, or the one named after its folder. */
function fudOf(path: string): string {
  return path.endsWith('.fud') ? path : join(path, `${path.split(/[\\/]/u).pop()!}.fud`);
}

/** The hashes of every `look` line of the piece: their shots are kept. */
function lookHashes(lines: Awaited<ReturnType<typeof unitState>>['lines']): readonly string[] {
  return lines.flatMap((line) => (line.event.kind === 'look' ? [line.event.hash] : []));
}

/** The shots of `tag` no `look` line and not now names: removed when others are written. */
function sweep(root: string, tag: string, keep: ReadonlySet<string>): void {
  const dir = join(root, LOOKS_DIR, tag);
  for (const name of readdirSync(dir)) if (!keep.has(name)) rmSync(join(dir, name), { recursive: true, force: true });
}

const dataUrl = (png: Buffer): string => `data:image/png;base64,${png.toString('base64')}`;

export async function lookTool(project: Project, checks: Checks, queue: RunQueue, input: LookInput, deps: LookDeps = nodeLookDeps): Promise<Answer> {
  const { root } = project;
  if (!isFudicProject(root)) return { body: {}, diagnostics: [FUD1404({ folder: root })], failed: true };
  const located = locate(root, input.piece);
  if ('error' in located) return { body: {}, diagnostics: [located.error], failed: true };
  const file = fudOf(located.path);
  const shown = posix(relative(root, file));
  const fail = (diagnostics: readonly Problem[]): Answer => ({ body: { piece: shown }, diagnostics, failed: true });
  const service = await checks.service();
  const piece: Piece | undefined = service.pieces().find((p) => toPosix(p.file) === toPosix(resolve(file)));
  if (piece === undefined) return fail([FUD1405({ name: input.piece })]);
  if (piece.kind === 'route') return fail([FUD1426({ file: shown, reason: 'route' })]);

  const folder = projectOf(await checks.folders(), root, piece.file);
  const { lookInBrowser } = await deps.runners(folder);
  if (lookInBrowser === undefined) return fail([FUD1207({ reason: '@fudic/workbench is not installed in the project: pnpm add -D @fudic/workbench' })]);
  const tag = piece.name;
  const hash = lookHashOf(piece.file, folder, root);
  const state = await unitState(piece.file, { ...nodeIo(root), lookHash: async () => hash });
  // The last look the user approved, since the piece last started over.
  const reopened = state.lines.findLastIndex((line) => line.event.kind === 'reopened');
  const last = lookHashes(state.lines.slice(reopened + 1)).at(-1);

  const result = await queue.run(() => lookInBrowser({ component: piece.file, ...(input.cases !== undefined ? { cases: input.cases } : {}) }));
  if ('diagnostic' in result) return fail([result.diagnostic]);
  switch (result.kind) {
    case 'no-fixture':
      return fail([FUD1426({ file: shown, reason: 'no-fixture' })]);
    case 'no-cases':
      return fail([FUD1426({ file: shown, reason: 'no-cases' })]);
    case 'no-case':
      return fail([FUD1421({ tag, name: result.name, cases: result.cases })]);
    case 'threw':
      return fail([FUD1420({ piece: tag, reason: result.message, file: shown })]);
    case 'looked':
      break;
  }

  // What was approved, read before the new shots go in: the folder may be the same one.
  const before = last === undefined ? undefined : lookDir(root, tag, last);
  const kept = before !== undefined && existsSync(before);
  const old = new Map<string, Buffer>();
  if (kept) for (const name of readdirSync(before)) old.set(name.replace(/\.png$/u, ''), readFileSync(join(before, name)));

  const dir = lookDir(root, tag, hash);
  mkdirSync(dir, { recursive: true });
  sweep(root, tag, new Set([hash, ...lookHashes(state.lines)]));

  const diagnostics: Problem[] = [];
  const cases: Record<string, unknown>[] = [];
  const view: Record<string, unknown>[] = [];
  const images: { png: Buffer }[] = [];
  const at = (hashOf: string, name: string): string => `${LOOKS_DIR}/${tag}/${hashOf}/${name}.png`;
  for (const one of result.painted) {
    if ('notJson' in one) {
      diagnostics.push(FUD1428({ prop: one.notJson }));
      continue;
    }
    if ('error' in one || one.errors.length > 0 || one.png === undefined) {
      const reason = 'error' in one ? one.error : one.errors[0] ?? 'it drew nothing to photograph';
      diagnostics.push(FUD1420({ piece: `${tag} (${one.name})`, reason, file: shown }));
      continue;
    }
    writeFileSync(join(dir, `${one.name}.png`), one.png);
    const was = old.get(one.name);
    const verdict: Verdict = was === undefined ? 'new' : was.equals(one.png) ? 'same' : 'changed';
    const shownBefore = verdict === 'changed' ? at(last!, one.name) : undefined;
    cases.push({ case: one.name, verdict, ...(verdict !== 'same' ? { ...(shownBefore !== undefined ? { before: shownBefore } : {}), after: at(hash, one.name) } : {}) });
    view.push({ case: one.name, verdict, ...(was !== undefined ? { before: dataUrl(was) } : {}), after: dataUrl(one.png) });
    if (verdict !== 'same') {
      if (was !== undefined && verdict === 'changed') images.push({ png: was });
      images.push({ png: one.png });
    }
  }
  // What was there and is no more: only when every case was looked at.
  if (input.cases === undefined) {
    for (const name of old.keys()) {
      if (result.cases.includes(name)) continue;
      cases.push({ case: name, verdict: 'gone', before: at(last!, name) });
      view.push({ case: name, verdict: 'gone', before: dataUrl(old.get(name)!) });
    }
  }

  const blocks: CallToolResult['content'][number][] = images
    .slice(0, MAX_IMAGES)
    .map(({ png }) => ({ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }));
  const lost = last !== undefined && !kept ? `The shots of the last approved look are not on this disk, so every case is new. ` : '';
  return {
    body: { piece: shown, look: state.look, hash, cases },
    diagnostics,
    next: `${lost}Show the user the before and after of ${tag} and ask whether they approve its look. Only if they do, call fudic_record { event: "look" }.`,
    meta: { [VIEW_META_KEY]: { kind: 'look', cases: view } },
    blocks,
  };
}
