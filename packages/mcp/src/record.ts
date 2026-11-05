/**
 * `fudic_record`: what a person decides, or what closes a piece, in its history (SDD-77 §4.6).
 * `approved` and `accepted` are the plans of `fudic approve` and `fudic accept`, with their hash
 * and their tag; `reopened` and `done` are written here, `done` only when every phase is.
 */

import { existsSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';
import { basename, relative } from 'node:path';
import { FUD1401, FUD1404, FUD1407, FUD1410, FUD1426, FUD1427 } from '@fudic/diagnostics';
import { git, nodeIo, record, unitState } from '@fudic/history';
import { toPosix } from '@fudic/typecheck';
import type { Checks } from './checks.js';
import { locate } from './locate.js';
import { looked } from './look.js';
import { lookHashOf } from './look-hash.js';
import { phasesOf } from './phases.js';
import { runPlan } from './plans.js';
import { isFudicProject, projectOf, type Project } from './project.js';
import type { Answer } from './respond.js';

export const RECORD_EVENTS = ['approved', 'accepted', 'reopened', 'look', 'done'] as const;
export type RecordEvent = (typeof RECORD_EVENTS)[number];

export interface RecordInput {
  /** A component's or a route's `.fud`, or its folder. */
  readonly piece: string;
  readonly event: RecordEvent;
  readonly text?: string;
}

function posix(path: string): string {
  return path.replace(/\\/gu, '/');
}

/** The `.fud` of a piece: the file itself, or the one named after its folder. */
function unitOf(path: string): string {
  return existsSync(path) && statSync(path).isDirectory() ? `${path}/${basename(path)}.fud` : path;
}

export async function recordEvent(project: Project, checks: Checks, input: RecordInput): Promise<Answer> {
  const { root } = project;
  if (!isFudicProject(root)) return { body: {}, diagnostics: [FUD1404({ folder: root })], failed: true };
  const located = locate(root, input.piece);
  if ('error' in located) return { body: {}, diagnostics: [located.error], failed: true };
  const unit = unitOf(located.path);
  const shown = posix(relative(root, unit));
  if (!existsSync(unit)) return { body: {}, diagnostics: [FUD1401({ file: shown, reason: 'missing' })], failed: true };
  const text = input.text?.trim() ?? '';
  const { cli } = await checks.fudic();

  switch (input.event) {
    case 'approved':
      return (await runPlan(cli, project, ['approve', shown], { dryRun: false })).answer;
    case 'accepted':
      if (text === '') return { body: {}, diagnostics: [FUD1410({ event: 'accepted' })], failed: true };
      return (await runPlan(cli, project, ['accept', shown, text], { dryRun: false })).answer;
    case 'reopened':
      if (text === '') return { body: {}, diagnostics: [FUD1410({ event: 'reopened' })], failed: true };
      await record(unit, { kind: 'reopened', by: 'agent', text }, nodeIo(root));
      return { body: { piece: shown, recorded: ['reopened'] } };
    case 'look':
      return look(project, checks, unit, shown);
    case 'done':
      return done(project, checks, unit, shown);
  }
}

/** `documented`, `connected` and `done`, once every phase of the piece is finished. */
async function done(project: Project, checks: Checks, unit: string, shown: string): Promise<Answer> {
  const { root } = project;
  await checks.run();
  const units = await phasesOf(root, checks);
  const found = units.find((u) => u.piece === shown);
  if (found === undefined) return { body: {}, diagnostics: [FUD1401({ file: shown, reason: 'missing' })], failed: true };
  // A finished piece is `done` too, but only the history's `done` line closes it.
  if (found.phase === 'done' && !found.complete) return { body: { piece: shown, recorded: [] }, next: null };
  if (!found.complete) return { body: { piece: shown, phase: found.phase }, diagnostics: [FUD1407({ file: shown, phase: found.phase })], failed: true };

  const io = nodeIo(root);
  const before = await unitState(unit, io);
  const named = new Set(before.lines.flatMap((line) => (line.event.kind === 'connected' ? line.event.functions : [])));
  const [documented, props] = found.documented.split('/').map(Number) as [number, number];
  const recorded: string[] = ['documented'];
  await record(unit, { kind: 'documented', documented, props }, io);
  const fresh = found.connectedFunctions.filter((name) => !named.has(name));
  if (fresh.length > 0) {
    await record(unit, { kind: 'connected', functions: fresh }, io);
    recorded.push('connected');
  }
  await record(unit, { kind: 'done' }, io);
  recorded.push('done');
  return { body: { piece: shown, recorded } };
}

/** Who approves: the name git commits with, or the user of the system. */
async function personOf(root: string): Promise<string> {
  return (await git(root, ['config', 'user.name'])) ?? userInfo().username;
}

/**
 * `look by <person> hash <lookHash>`: the user approved how the component looks, over the shots
 * `fudic_look` took of it as its files are now (SDD-78 §4.5). Without them nothing is written:
 * what nobody saw is not approved.
 */
async function look(project: Project, checks: Checks, unit: string, shown: string): Promise<Answer> {
  const { root } = project;
  const piece = (await checks.service()).pieces().find((p) => toPosix(p.file) === toPosix(unit));
  if (piece?.kind !== 'component') return { body: { piece: shown }, diagnostics: [FUD1426({ file: shown, reason: 'route' })], failed: true };
  const hash = lookHashOf(piece.file, projectOf(await checks.folders(), root, piece.file), root);
  if (!looked(root, piece.name, hash)) return { body: { piece: shown }, diagnostics: [FUD1427({ file: shown })], failed: true };
  await record(unit, { kind: 'look', by: await personOf(root), hash }, nodeIo(root));
  return { body: { piece: shown, recorded: ['look'], hash } };
}
