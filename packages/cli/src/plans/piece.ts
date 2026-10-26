/**
 * `fudic g service` and `fudic g form` (BUG-50 §4.7): a module of the project and its unit test,
 * in `src/services/` or `src/forms/`, and the fudic module it needs when the project lacks it.
 *
 * A service is a class `Service(…)` registers in the root — a call, not a decorator, as
 * `examples/basic` writes it — or, with `--provided`, one a component provides. A form is a
 * `form` of a `.fudapi` with a required `name` (SDD-60 §3.6): typed, so the upload travels in
 * binary, and imported from what fudic generates of it.
 */

import { API_EXTENSION } from '@fudic/api';
import { FUD0457 } from '@fudic/diagnostics';
import { joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { renderTemplate } from '../templates.js';
import { addedLine, dependOnModule, installFor, projectName } from '../workspace/modules.js';
import { resolveTarget } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type CliError, type FileChange, type FormOptions, type Plan, type ServiceOptions } from '../types.js';

/** A name that is a file name and, once camel-cased, an identifier. */
const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

/** `shopping-cart` → `ShoppingCart`. */
function pascal(name: string): string {
  return name
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

interface PieceSpec {
  readonly kind: 'service' | 'form';
  /** The identifier the module exports. */
  readonly symbol: string;
  readonly dir: string;
  readonly file: string;
  readonly contents: string;
  /** What the report says the module is. */
  readonly what: string;
  readonly test: string | null;
  readonly pkg: string;
}

export function planService(name: string, opts: ServiceOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const symbol = pascal(name);
  return planPiece(
    name,
    opts,
    {
      kind: 'service',
      symbol,
      dir: 'src/services',
      file: `${name}.service.ts`,
      contents: renderTemplate(opts.provided ? 'service/provided.ts.tmpl' : 'service/root.ts.tmpl', { class: symbol }),
      what: opts.provided
        ? `class ${symbol}, provided by a component: provide(${symbol}) for its subtree`
        : `class ${symbol}, registered in the root: inject(${symbol}) anywhere`,
      test: opts.test ? renderTemplate('service/test.ts.tmpl', { class: symbol, name }) : null,
      pkg: '@fudic/di',
    },
    io,
  );
}

export function planForm(name: string, opts: FormOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const symbol = `${pascal(name).charAt(0).toLowerCase()}${pascal(name).slice(1)}Form`;
  return planPiece(
    name,
    opts,
    {
      kind: 'form',
      symbol,
      dir: 'src/forms',
      file: `${name}${API_EXTENSION}`,
      contents: renderTemplate('form/form.fudapi.tmpl', { form: symbol }),
      what: `its fields, their rules and their texts: import it from fudic:forms/${name}`,
      test: opts.test ? renderTemplate('form/test.ts.tmpl', { form: symbol, name }) : null,
      pkg: '@fudic/forms',
    },
    io,
  );
}

function planPiece(name: string, opts: ServiceOptions | FormOptions, spec: PieceSpec, io: ReadIo): Promise<Plan> {
  if (!NAME.test(name)) return Promise.resolve({ ...EMPTY_PLAN, errors: [FUD0457({ kind: spec.kind, name })] });
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: resolved.errors });
  const target = resolved.target;

  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  const files = [
    { file: spec.file, contents: spec.contents, what: spec.what },
    ...(spec.test === null ? [] : [{ file: spec.file.replace(/\.(?:ts|fudapi)$/u, '.test.ts'), contents: spec.test, what: 'unit test' }]),
  ];
  for (const piece of files) {
    const written = targetChange(opts.cwd, joinPosix(target.dir, spec.dir, piece.file), piece.contents, opts.force, io);
    if (written.error !== undefined) errors.push(written.error);
    if (written.change !== undefined) changes.push(written.change);
  }

  // The module it is written against, when the project does not have it yet (§4.6).
  const dependency = dependOnModule(target, spec.pkg, io);
  if (dependency !== undefined) changes.push(dependency);

  const width = Math.max(...files.map((piece) => piece.file.length)) + 4;
  return Promise.resolve({
    ...EMPTY_PLAN,
    changes,
    errors,
    commands: dependency === undefined ? [] : [installFor(target, opts.cwd, io)],
    report: [
      '',
      `Created ${spec.kind} ${spec.symbol} in ${joinPosix(target.dir, spec.dir)}/`,
      ...files.map((piece) => `  ${piece.file.padEnd(width)}${piece.what}`),
      ...(dependency === undefined ? [] : ['', addedLine(spec.pkg, projectName(target))]),
    ],
  });
}
