/**
 * `fudic g api <piece>` (SDD-66 §3.1, §4.1): the server of a route or a component that already
 * exists. Three things that have to agree are written together — the `.fudapi` beside the `.fud`,
 * its handler in the server folder and the `<link rel="server">` in its place — so nobody has to
 * get the `<id>` right by hand.
 */

import { API_EXTENSION } from '@fudic/api';
import { SRC_DIR } from '@fudic/conventions';
import { FUD1240, FUD1241 } from '@fudic/diagnostics';
import { nodeReadIo, type ReadIo } from '../io.js';
import { parseFud, staticAttr } from '../parse.js';
import { absolute, joinPosix, relativeTo, toPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { renderTemplate, serverLink } from '../templates.js';
import { wireServerLink } from '../wire.js';
import { dependOnModule, installFor } from '../workspace/modules.js';
import { resolveTarget } from '../workspace/target.js';
import { EMPTY_PLAN, type CliError, type FileChange, type Plan, type TargetedOptions } from '../types.js';

/** What the piece is, for the templates: a component gets a function, a route its `load`. */
type Role = 'component' | 'route';

/** The `.fud` a written piece stands for: itself, or the one named after its folder. */
function fudOf(path: string, io: ReadIo): string {
  if (!io.isDirectory(path)) return path;
  return `${path}/${path.slice(path.lastIndexOf('/') + 1)}.fud`;
}

export function planApi(written: string, opts: TargetedOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: resolved.errors });
  const target = resolved.target;
  const refuse = (error: CliError): Promise<Plan> => Promise.resolve({ ...EMPTY_PLAN, errors: [error] });

  // `<piece>` is relative to the project, which is what makes `--project` work from the root.
  const unit = fudOf(toPosix(absolute(opts.cwd, joinPosix(target.dir, written))), io);
  if (!unit.endsWith('.fud') || !io.exists(unit)) return refuse(FUD1240({ file: written }));

  const source = io.read(unit);
  const { doc } = parseFud(source);
  let role: Role;
  switch (doc.type) {
    case 'component-document':
      role = 'component';
      break;
    case 'route-document':
    case 'page-document':
      role = 'route';
      break;
    default:
      return refuse(FUD1240({ file: written }));
  }
  // A library's `.fudapi` lives in its `fudapi/` folder and its handlers ship compiled (§4.1).
  if (target.config.kind === 'lib') return refuse(FUD1241({ file: written }));

  const fud = relativeTo(absolute(opts.cwd, '.'), unit);
  const api = fud.replace(/\.fud$/u, API_EXTENSION);
  // The `<id>`: the path of the `.fudapi` inside `src/`, without the extension (SDD-60 §3.11).
  const id = relativeTo(target.path, unit).replace(new RegExp(`^${SRC_DIR}/`, 'u'), '').replace(/\.fud$/u, '');
  const handler = joinPosix(target.config.server, `${id}.ts`);
  const templates = role === 'component' ? 'component-api' : 'load';

  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  const files = [
    { file: api, contents: renderTemplate(`${templates}.fudapi.tmpl`, { handler }) },
    { file: joinPosix(target.dir, handler), contents: renderTemplate(`${templates}.ts.tmpl`, { id }) },
  ];
  for (const one of files) {
    const change = targetChange(opts.cwd, one.file, one.contents, opts.force, io);
    if (change.error !== undefined) errors.push(change.error);
    if (change.change !== undefined) changes.push(change.change);
  }

  // The link, unless it is there already: a `--force` rewrites the server, not the `.fud`.
  const href = `./${api.slice(api.lastIndexOf('/') + 1)}`;
  const linked = (doc.serverLinks ?? []).some((link) => staticAttr(link, 'href') === href);
  if (!linked) changes.push({ kind: 'modify', path: fud, contents: wireServerLink(source, doc, serverLink(href)), before: source });

  if (errors.length > 0) return Promise.resolve({ ...EMPTY_PLAN, errors });
  // A server function is called through @fudic/http: the project depends on it once it has one.
  const dependency = dependOnModule(target, '@fudic/http', io);
  if (dependency === undefined) return Promise.resolve({ ...EMPTY_PLAN, changes });
  return Promise.resolve({ ...EMPTY_PLAN, changes: [...changes, dependency], commands: [installFor(target, opts.cwd, io)] });
}
