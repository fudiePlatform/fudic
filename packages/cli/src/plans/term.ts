/**
 * `fudic g term <block> <name>` (SDD-53 §4.2): a term module the `.fudspec` validator reads
 * clean, at `<project>/fudic/terms/<block>/<name>.js`. The module itself is `@fudic/spec`'s,
 * the same one the editor's light bulb creates.
 *
 * Everything the validator would later reject is rejected here instead, before a file exists:
 * a block that is not one, a name no `.fudspec` line could resolve to, a parameter type outside
 * the closed list, a parameter given twice.
 */

import { FUD0448, FUD0961, FUD0962, FUD0963 } from '@fudic/diagnostics';
import { TERMS_DIR, termModule, type BlockKind, type ParamType, type TermParam } from '@fudic/spec';
import { joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { resolveTarget } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, Plan, TermOptions } from '../types.js';

const BLOCKS: readonly string[] = ['given', 'when', 'then'] satisfies readonly BlockKind[];
const TYPES: readonly string[] = ['element', 'number', 'string', 'token'] satisfies readonly ParamType[];

/** What a `.fudspec` resolves a term to: kebab-case. */
const TERM_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** `run` destructures its parameters by name, so a name is an identifier. */
const PARAM = /^([A-Za-z_$][\w$]*):(.*)$/u;

export function planTerm(name: string, opts: TermOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const fail = (error: CliError): Promise<Plan> =>
    Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [error] });

  if (!BLOCKS.includes(opts.block)) return fail(FUD0448({ problem: 'term-block', value: opts.block }));
  if (!TERM_NAME.test(name)) return fail(FUD0961({ name }));

  const params: TermParam[] = [];
  for (const written of opts.params) {
    const match = PARAM.exec(written);
    if (match === null || !TYPES.includes(match[2] as string)) return fail(FUD0962({ param: written }));
    const param = { name: match[1] as string, type: match[2] as ParamType };
    if (params.some((p) => p.name === param.name)) return fail(FUD0963({ name: param.name }));
    params.push(param);
  }

  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: resolved.errors });
  }
  const block = opts.block as BlockKind;
  const file = joinPosix(resolved.target.dir, TERMS_DIR, block, `${name}.js`);
  const target = targetChange(opts.cwd, file, termModule(block, name, params), opts.force, io);
  return Promise.resolve({
    changes: target.change === undefined ? [] : [target.change],
    commands: [],
    diagnostics: [],
    errors: target.error === undefined ? [] : [target.error],
  });
}
