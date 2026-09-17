/**
 * `fudic g lib <nombre>` (SDD-44 §4.5): a library, generated to be CONSUMED.
 *
 * Not an app with things taken away, which is the obvious idea and the wrong one (§1.2). What
 * a library lacks is not a list of omissions: it is everything needed to SERVE an application,
 * and a library is not served. So there is no `vite.config.ts`, no `sw.json`, no `src/routes/`
 * and no layout — and no `id`, because it has no caches to name.
 *
 * What it has instead is the thing that defines it: a `package.json` whose `exports` and
 * `files` point at the **`.fud` sources**, not at a `dist` (SDD-43 §4.1). Generated as an app
 * minus some files, it would produce a package nobody can consume.
 */

import { CONFIG_FILE } from '@fudic/config';
import { COMPONENTS_DIR } from '@fudic/conventions';
import { scaffoldChanges, tsconfigFor, type ScaffoldFile } from './scaffold.js';
import { joinPosix } from '../paths.js';
import { placeProject } from '../workspace/place.js';
import { libUses, packageOf, usesErrors } from '../workspace/uses.js';
import { prefixField, renderTemplate } from '../templates.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import { EMPTY_PLAN, type Plan, type ProjectOptions } from '../types.js';

/**
 * `src/components/` has to exist, and a directory is not a file.
 *
 * `.gitkeep` is how an empty directory survives a commit, and it is the whole content of this
 * one: the alternative — a sample component — is a file the author deletes before writing
 * anything, and a tag claimed in the global registry by nobody's decision.
 */
const KEEP = '.gitkeep';

export function planLib(
  name: string,
  opts: ProjectOptions,
  io: ReadIo = nodeReadIo(),
): Promise<Plan> {
  const placed = placeProject(name, opts, io);
  if (placed.placement === undefined) {
    return Promise.resolve({ ...EMPTY_PLAN, errors: placed.errors });
  }
  const { dir, up, scope, projects } = placed.placement;

  const errors = usesErrors(opts.uses, projects);
  if (errors.length > 0) return Promise.resolve({ ...EMPTY_PLAN, errors });

  const pkgName = packageOf(scope, name);
  const files: readonly ScaffoldFile[] = [
    [
      joinPosix(dir, 'package.json'),
      renderTemplate('lib/package.json.tmpl', {
        name: pkgName,
        uses: libUses(scope, opts.uses),
      }),
    ],
    [joinPosix(dir, 'README.md'), renderTemplate('lib/README.md.tmpl', { name: pkgName, project: name })],
    [joinPosix(dir, '.gitignore'), renderTemplate('gitignore.tmpl', {})],
    // No `id`: a library has no Service Worker and therefore no caches to namespace. The
    // prefix is optional here as everywhere — it proposes, and `fudic g lib ui` without one
    // writes the same library with one field fewer (§4.5).
    [
      joinPosix(dir, CONFIG_FILE),
      renderTemplate('lib/fudic.json.tmpl', { prefix: prefixField(opts.prefix) }),
    ],
    [joinPosix(dir, 'tsconfig.json'), tsconfigFor({ dir, pkgName, up, uses: '' })],
    [joinPosix(dir, COMPONENTS_DIR, KEEP), ''],
  ];

  const built = scaffoldChanges(opts, files, io);
  return Promise.resolve({ ...EMPTY_PLAN, changes: built.changes, errors: built.errors });
}
