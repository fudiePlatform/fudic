/**
 * `fudic_record`: what a person decides, or what closes a piece, in its history (SDD-77 §4.6).
 * `approved` and `accepted` are the plans of `fudic approve` and `fudic accept`, with their hash
 * and their tag; `reopened` and `done` are written here, `done` only when every phase is.
 */

import { existsSync, statSync } from 'node:fs';
import { basename, relative } from 'node:path';
import { FUD1401, FUD1404, FUD1407, FUD1410 } from '@fudic/diagnostics';
import { nodeIo, record, unitState } from '@fudic/history';
import type { Checks } from './checks.js';
import { locate } from './locate.js';
import { showcaseCurrent, unitsOf } from './phases.js';
import { runPlan } from './plans.js';
import { isFudicProject, type Project } from './project.js';
import type { Answer } from './respond.js';

export const RECORD_EVENTS = ['approved', 'accepted', 'reopened', 'done'] as const;
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
    case 'done':
      return done(project, checks, unit, shown, cli);
  }
}

/** `documented`, `connected` and `done`, once every phase of the piece is finished. */
async function done(project: Project, checks: Checks, unit: string, shown: string, cli: Parameters<typeof showcaseCurrent>[1]): Promise<Answer> {
  const { root } = project;
  await checks.run();
  const service = await checks.service();
  const units = await unitsOf(root, service, { showcase: await showcaseCurrent(root, cli) });
  const found = units.find((u) => u.piece === shown);
  if (found === undefined) return { body: {}, diagnostics: [FUD1401({ file: shown, reason: 'missing' })], failed: true };
  if (found.phase === 'done') return { body: { piece: shown, recorded: [] }, next: null };
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
