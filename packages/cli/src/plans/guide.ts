/**
 * `fudic g guide [name]`: the style guide, whole — tokens with a dark mode, a font, a favicon and
 * one sheet per element the browser styles. In a workspace it is a library apps and libraries
 * depend on; in a standalone app it lives inside the app, in `src/guide/`.
 */

import { FUD1444 } from '@fudic/diagnostics';
import { APP_GUIDE_DIR, APP_GUIDE_FIELDS, guideFiles } from './guide-files.js';
import { scaffoldChanges } from './scaffold.js';
import { absolute, dirname, joinPosix } from '../paths.js';
import { configChange, readConfigObject } from '../workspace/config-edit.js';
import { workspaceRoot } from '../workspace/discover.js';
import { projectName } from '../workspace/modules.js';
import { placeProject } from '../workspace/place.js';
import { packageOf } from '../workspace/uses.js';
import { resolveTarget } from '../workspace/target.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type GuideOptions, type Plan } from '../types.js';

export function planGuide(name: string, opts: GuideOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  return Promise.resolve(workspaceRoot(opts.cwd, io) === null ? inApp(opts, io) : inWorkspace(name, opts, io));
}

/** A library of its own, in `libs/<name>`. */
function inWorkspace(name: string, opts: GuideOptions, io: ReadIo): Plan {
  const placed = placeProject(name, opts, io);
  if (placed.placement === undefined) return { ...EMPTY_PLAN, errors: placed.errors };
  const { dir, scope } = placed.placement;
  // The placeholder that kept `libs/` in git goes with the first library that fills it.
  const keep = joinPosix(dirname(dir), '.gitkeep');
  const built = scaffoldChanges(opts, guideFiles(dir, name, packageOf(scope, name)), io);
  return {
    ...EMPTY_PLAN,
    changes: built.changes,
    ...(io.exists(absolute(opts.cwd, keep)) ? { deletions: [keep] } : {}),
    errors: built.errors,
    report: [
      '',
      `Created style guide ${name} in ${dir}`,
      '',
      '  every page of a project that depends on it links the guide, pruned to what it uses',
      '  a component adopts its pieces by name: shadowrootadoptedstylesheets="button"',
      '',
      'Use it',
      `  fudic add ${name} --project <app or library>`,
    ],
  };
}

/** The app's own guide, in `src/guide/`, named in its `fudic.json`. */
function inApp(opts: GuideOptions, io: ReadIo): Plan {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return { ...EMPTY_PLAN, errors: resolved.errors };
  const target = resolved.target;
  if (target.config.guide !== undefined) {
    return { ...EMPTY_PLAN, errors: [FUD1444({ sheet: target.config.guide.sheet })] };
  }
  const config = readConfigObject(target, io);
  const built = scaffoldChanges(opts, guideFiles(joinPosix(target.dir, APP_GUIDE_DIR), projectName(target)), io);
  const globalStyles = { ...((config['globalStyles'] ?? {}) as Record<string, string>), ...APP_GUIDE_FIELDS.globalStyles };
  return {
    ...EMPTY_PLAN,
    changes: [...built.changes, configChange(target, { ...config, globalStyles, guide: APP_GUIDE_FIELDS.guide }, io)],
    errors: built.errors,
    report: [
      '',
      `Created the style guide in ${joinPosix(target.dir, APP_GUIDE_DIR)}`,
      '',
      '  every page links it, pruned to what it uses',
      '  a component adopts its pieces by name: shadowrootadoptedstylesheets="button"',
    ],
  };
}
