/**
 * `fudic_call`: what a function of a `.fudapi` would answer to a call (SDD-78 §4.2), by the
 * browser's road — the page's own call, sent to the dev server, through its middlewares, the
 * form's rules and `fails`/`catches`. A `Problem` is an answer, not an error of the tool. No
 * session goes with it: a function behind one answers the `401` the chat has to see.
 */

import { FUD1207, FUD1404, FUD1405, FUD1420, FUD1423, FUD1424, type WireDiagnostic } from '@fudic/diagnostics';
import { closest } from '@fudic/spec';
import { SERVER_DIR } from '@fudic/conventions';
import type { Checks } from './checks.js';
import { missingOf } from './dev-server.js';
import type { Problem } from './diagnostics.js';
import { loadRunners, type Runners } from './fudic.js';
import { isFudicProject, type Project } from './project.js';
import type { Answer } from './respond.js';
import type { Site } from './site.js';

export interface CallInput {
  /** `<id>.<name>`: `routes/products.save`. */
  readonly fn: string;
  readonly args?: unknown;
  readonly params?: Readonly<Record<string, string>>;
}

export interface CallDeps {
  readonly runners: (root: string) => Promise<Runners>;
  readonly waitMs?: number;
}

const nodeCallDeps: CallDeps = { runners: (root) => loadRunners(root) };

function fromWire(d: WireDiagnostic): Problem {
  return { code: d.code, severity: d.severity, message: d.message };
}

export async function callTool(project: Project, checks: Checks, site: Site, input: CallInput, deps: CallDeps = nodeCallDeps): Promise<Answer> {
  const { root } = project;
  const { fn } = input;
  if (!isFudicProject(root)) return { body: {}, diagnostics: [FUD1404({ folder: root })], failed: true };
  const fail = (diagnostics: readonly Problem[]): Answer => ({ body: { fn }, diagnostics, failed: true });
  const functions = (await checks.service()).symbols('functions');
  const symbol = functions.find((s) => s.name === fn);
  if (symbol === undefined) {
    const near = closest(fn, functions.map((s) => s.name));
    return fail([FUD1405({ name: fn, ...(near !== undefined ? { closest: near } : {}) })]);
  }
  const at = fn.lastIndexOf('.');
  const id = fn.slice(0, at);
  if (symbol.state === 'missing') return { ...fail([FUD1423({ fn })]), next: `fudic_contract { id: "${id}" } says what to write.` };

  const app = site.dev.app;
  const missing = missingOf(app);
  if (missing !== undefined) return fail([FUD1207({ reason: missing })]);
  const { callFunction } = await deps.runners(app);
  if (callFunction === undefined) return fail([FUD1207({ reason: '@fudic/testing is not installed in the project: pnpm add -D @fudic/testing' })]);
  const state = await site.dev.ready(deps.waitMs);
  if (state === 'failed') return fail([FUD1424({ reason: site.dev.failure })]);
  if (state !== 'ready') return { body: { fn, state }, next: 'The dev server is still starting: call fudic_call again in a moment.' };

  const result = await callFunction({
    root: app,
    id,
    name: fn.slice(at + 1),
    ...site.callTarget(),
    ...(input.args !== undefined ? { args: input.args } : {}),
    ...(input.params !== undefined ? { params: input.params } : {}),
  });
  switch (result.kind) {
    case 'broken':
      return fail(result.diagnostics.map(fromWire));
    case 'threw':
      return fail([FUD1420({ piece: fn, reason: result.message, file: symbol.file })]);
    case 'answered':
      return { body: { fn, status: result.status, value: result.value } };
    case 'problem':
      return {
        body: { fn, status: result.status, problem: result.problem },
        // A status the handler did not mean: what it threw unexpectedly, answered as a 5xx.
        next: result.status >= 500 ? `Fix the handler of ${fn} in ${SERVER_DIR}/${id}.ts.` : null,
      };
  }
}
