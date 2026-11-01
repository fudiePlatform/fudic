/**
 * `fudic g pipe <name>` (SDD-71 §3.6, §4.1): the contract in a `.fudapi`, its one implementation
 * in TS and its unit test, in the project's folder of pipes — of an app or of a library.
 *
 * Green as generated (BUG-50): on `str` the implementation hands the text back and the test
 * says so; on any other type it writes the value as text, and the test asks for text, with a
 * value of the type the contract gives — whatever the project declares that type to be.
 */

import { API_EXTENSION } from '@fudic/api';
import { FUD0457 } from '@fudic/diagnostics';
import { joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { renderTemplate } from '../templates.js';
import { addedLine, dependOnModule, installFor, projectName } from '../workspace/modules.js';
import { packageName } from '../workspace/link.js';
import { resolveTarget } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type CliError, type FileChange, type Plan, type PipeOptions } from '../types.js';

/** A name that is a file name and, once camel-cased, an identifier. */
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** `nombre-corto` → `nombreCorto`: the name the `.fudapi` exports it under. */
const camel = (name: string): string => name.replace(/-([a-z0-9])/gu, (_, c: string) => c.toUpperCase());

export function planPipe(name: string, opts: PipeOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  if (!NAME.test(name)) return Promise.resolve({ ...EMPTY_PLAN, errors: [FUD0457({ kind: 'pipe', name })] });
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: resolved.errors });
  const target = resolved.target;

  const folder = target.config.pipes;
  const symbol = camel(name);
  // The `<id>` of a `.fudapi` is its path inside `src/`, without the extension; a library's pipe
  // carries its package name, so its implementation imports what its apps know it by (§4.5).
  const local = joinPosix(folder, name).replace(/^src\//u, '');
  const id = target.config.kind === 'lib' ? `${packageName(target.path, io)}/${local}` : local;
  const text = opts.on === 'str';
  const files = [
    { file: `${name}${API_EXTENSION}`, contents: renderTemplate('pipe/pipe.fudapi.tmpl', { name, on: opts.on }), what: `the contract: what it formats, on ${opts.on}` },
    {
      file: `${name}.ts`,
      contents: renderTemplate('pipe/pipe.ts.tmpl', { symbol, id, body: text ? 'value' : 'String(value)' }),
      what: 'its one implementation: the view, the server and the browser import it',
    },
    {
      file: `${name}.test.ts`,
      contents: renderTemplate('pipe/test.ts.tmpl', {
        symbol,
        name,
        assertion: text
          ? `  expect(${symbol}.format('fudic', 'en')).toBe('fudic');`
          : `  const value = {} as Parameters<typeof ${symbol}.format>[0];\n  expect(typeof ${symbol}.format(value, 'en')).toBe('string');`,
      }),
      what: 'unit test',
    },
  ];

  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  for (const piece of files) {
    const written = targetChange(opts.cwd, joinPosix(target.dir, folder, piece.file), piece.contents, opts.force, io);
    if (written.error !== undefined) errors.push(written.error);
    if (written.change !== undefined) changes.push(written.change);
  }

  // `Pipe` and the presets are `@fudic/core`'s.
  const dependency = dependOnModule(target, '@fudic/core', io);
  if (dependency !== undefined) changes.push(dependency);

  const width = Math.max(...files.map((piece) => piece.file.length)) + 4;
  return Promise.resolve({
    ...EMPTY_PLAN,
    changes,
    errors,
    commands: dependency === undefined ? [] : [installFor(target, opts.cwd, io)],
    report: [
      '',
      `Created pipe ${symbol} in ${joinPosix(target.dir, folder)}/`,
      ...files.map((piece) => `  ${piece.file.padEnd(width)}${piece.what}`),
      '',
      `Use it in a view:  @code { import ${symbol} from '…/pipes/${name}'; }  then  @(value | ${symbol})`,
      ...(dependency === undefined ? [] : ['', addedLine('@fudic/core', projectName(target))]),
    ],
  });
}
