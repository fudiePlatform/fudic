/**
 * `fudic g style <name>` (BUG-50 §4.7): a global stylesheet of the project — `<name>.css` in its
 * root and `"globalStyles": { "<name>": "<name>.css" }` in its `fudic.json`. Every component of
 * the project adopts it, after the sheets of the libraries it uses.
 *
 * In a library the sheet is part of what it publishes, so its `package.json` lists it in
 * `files` and `exports` as well: an app that uses the library reads it from there.
 */

import { STYLE_NAME_PATTERN } from '@fudic/config';
import { FUD0456 } from '@fudic/diagnostics';
import { joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { renderTemplate } from '../templates.js';
import { configChange, readConfigObject } from '../workspace/config-edit.js';
import { projectName } from '../workspace/modules.js';
import { resolveTarget, type Target } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type CliError, type FileChange, type Plan, type TargetedOptions } from '../types.js';

export function planStyle(name: string, opts: TargetedOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  if (!STYLE_NAME_PATTERN.test(name)) return Promise.resolve({ ...EMPTY_PLAN, errors: [FUD0456({ problem: 'name', name })] });
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: resolved.errors });
  const target = resolved.target;

  const config = readConfigObject(target, io);
  const styles = (config['globalStyles'] ?? {}) as Record<string, string>;
  const taken = styles[name];
  if (taken !== undefined) return Promise.resolve({ ...EMPTY_PLAN, errors: [FUD0456({ problem: 'taken', name, path: taken })] });

  const file = `${name}.css`;
  const project = projectName(target);
  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  const sheet = targetChange(opts.cwd, joinPosix(target.dir, file), renderTemplate('styles/global.css.tmpl', { project }), opts.force, io);
  if (sheet.error !== undefined) errors.push(sheet.error);
  if (sheet.change !== undefined) changes.push(sheet.change);
  changes.push(configChange(target, { ...config, globalStyles: { ...styles, [name]: file } }, io));
  if (target.config.kind === 'lib') changes.push(published(target, file, io));

  return Promise.resolve({
    ...EMPTY_PLAN,
    changes,
    errors,
    report: ['', `Created ${file} in ${target.dir}`, `  adopted by every component of ${project}, after the sheets of the libraries it uses`],
  });
}

/** The library's `package.json` with `file` in `files` and in `exports`. */
function published(target: Target, file: string, io: ReadIo): FileChange {
  const path = joinPosix(target.path, 'package.json');
  const before = io.read(path);
  const manifest = JSON.parse(before) as Record<string, unknown>;
  const files = (manifest['files'] ?? []) as string[];
  const exports = (manifest['exports'] ?? {}) as Record<string, unknown>;
  const next = {
    ...manifest,
    files: files.includes(file) ? files : [...files, file],
    exports: { ...exports, [`./${file}`]: `./${file}` },
  };
  return { kind: 'modify', path: joinPosix(target.dir, 'package.json'), contents: `${JSON.stringify(next, null, 2)}\n`, before };
}
