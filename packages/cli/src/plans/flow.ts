/**
 * `fudic g flow <name>` (SDD-82 §3.10): the criteria of a flow between pages, in
 * `src/flows/<name>.fudspec`, and its fixture with `services` empty — every service is the real
 * one until a group names its stand-in.
 *
 * The name is the file's and the header's: lowercase words joined by hyphens, the form a URL and
 * every file system keep as written. The files are what `@fudic/spec` generates.
 */

import { FUD0448 } from '@fudic/diagnostics';
import { FIXTURE_EXTENSION, FLOWS_DIR, SPEC_EXTENSION, flowFixtureModule, flowSpecSkeleton } from '@fudic/spec';
import { joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { resolveTarget, routeRefusal } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, FileChange, Plan, SpecOptions } from '../types.js';

const FLOW_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function planFlow(name: string, opts: SpecOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const fail = (error: CliError): Promise<Plan> => Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [error] });
  if (!FLOW_NAME.test(name)) return fail(FUD0448({ problem: 'flow-name', value: name }));
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: resolved.errors });
  const project = resolved.target;
  // A flow walks the pages of an app: a library has none.
  const refusal = routeRefusal(project);
  if (refusal !== null) return fail(refusal);

  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  const spec = targetChange(opts.cwd, joinPosix(project.dir, FLOWS_DIR, `${name}${SPEC_EXTENSION}`), flowSpecSkeleton(name), opts.force, io);
  if (spec.error !== undefined) errors.push(spec.error);
  if (spec.change !== undefined) changes.push(spec.change);
  // An existing fixture already has its groups, and what someone put in them: it is kept.
  if (!io.exists(joinPosix(project.path, FLOWS_DIR, `${name}${FIXTURE_EXTENSION}`))) {
    changes.push({ kind: 'create', path: joinPosix(project.dir, FLOWS_DIR, `${name}${FIXTURE_EXTENSION}`), contents: flowFixtureModule() });
  }
  return Promise.resolve({ changes, commands: [], diagnostics: [], errors });
}
