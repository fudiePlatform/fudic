/**
 * `fudic g page <ruta>` (SDD-22 §4.5): ONE resolved form, never a menu. Offering "with
 * layout / without layout" would push a choice onto the user that only reveals itself as
 * wrong at compile time. The command picks the layout, writes the `rel="layout"` edge and
 * declares the sections the layout can render.
 */

import { API_EXTENSION } from '@fudic/api';
import { LAYOUTS_DIR } from '@fudic/conventions';
import { FUD0446 } from '@fudic/diagnostics';
import { hrefBetween, joinPosix } from '../paths.js';
import { resolveLayout } from '../layout.js';
import { targetChange } from '../project.js';
import { routeToFile, routeToUrl } from '../route.js';
import { resolveTarget, routeRefusal } from '../workspace/target.js';
import { indent, pageTest, renderTemplate, sectionBlocks, serverLink } from '../templates.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, FileChange, PageOptions, Plan, PlanDiagnostic } from '../types.js';

export function planPage(route: string, opts: PageOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: resolved.errors });
  }
  // A library has no routes (§4.8). Checked before the route is even mapped, because the
  // answer does not depend on the route and a FUD0783 about `/alta` would read as though a
  // different path might have worked.
  const refusal = routeRefusal(resolved.target);
  if (refusal !== null) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [refusal] });
  }

  const mapped = routeToFile(route);
  if (mapped.error !== undefined) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [mapped.error] });
  }

  const routesDir = joinPosix(resolved.target.dir, opts.dir);
  const file = joinPosix(routesDir, mapped.file);
  const layout = resolveLayout(
    file,
    opts.layout,
    { cwd: opts.cwd, routesDir, layoutsDir: joinPosix(resolved.target.dir, LAYOUTS_DIR) },
    io,
  );
  const diagnostics: PlanDiagnostic[] = [...layout.diagnostics];
  const errors: CliError[] = [...layout.errors];

  const sections = chooseSections(layout.sections, opts.sections, errors);
  if (errors.length > 0) return Promise.resolve({ changes: [], commands: [], diagnostics, errors });

  // `--server`: the `load` is declared in the `.fudapi` beside the route and implemented in the
  // server folder (SDD-60 §3.4, §3.12); the `.fud` only links it.
  const api = file.replace(/\.fud$/u, API_EXTENSION);
  const link = serverLink(`./${api.slice(api.lastIndexOf('/') + 1)}`);
  const contents =
    layout.path === null
      ? renderTemplate('page.fud', {
          lang: 'en',
          title: titleOf(route),
          code: opts.server ? indent(link, '    ') : '',
        })
      : renderTemplate('route.fud', {
          layoutHref: layout.specifier ?? hrefBetween(file, layout.path),
          code: opts.server ? link : '',
          title: opts.server ? '@data.title' : titleOf(route),
          sections: sectionBlocks(sections),
        });

  const changes: FileChange[] = [];
  const written = [{ file, contents }];
  if (opts.server) {
    // The `<id>` of the `.fudapi`: its path inside `src/`, without the extension (§3.11).
    const id = joinPosix(opts.dir, mapped.file).replace(/^src\//u, '').replace(/\.fud$/u, '');
    const handler = joinPosix(resolved.target.dir, resolved.target.config.server, `${id}.ts`);
    written.push(
      { file: api, contents: renderTemplate('load.fudapi.tmpl', { handler: joinPosix(resolved.target.config.server, `${id}.ts`) }) },
      { file: handler, contents: renderTemplate('load.ts.tmpl', { id }) },
    );
  }
  for (const one of written) {
    const target = targetChange(opts.cwd, one.file, one.contents, opts.force, io);
    if (target.error !== undefined) errors.push(target.error);
    if (target.change !== undefined) changes.push(target.change);
  }

  // Its unit test beside it, unless `--skip-test` (BUG-50 §4.4).
  if (opts.test) {
    const test = targetChange(opts.cwd, file.replace(/\.fud$/u, '.test.ts'), pageTest(routeToUrl(mapped.file)), opts.force, io);
    if (test.error !== undefined) errors.push(test.error);
    if (test.change !== undefined) changes.push(test.change);
  }

  return Promise.resolve({ changes, commands: [], diagnostics, errors });
}

/**
 * None of a layout's sections is mandatory (SDD-21 §4.2), so the default cannot be "the
 * mandatory ones": it is ALL of them, and dropping the ones you do not want is
 * `--sections` or three deleted lines. Asking for one the chain does not declare is an
 * error here, because at compile time it would only be a FUD0429 warning about content
 * that silently goes nowhere.
 */
function chooseSections(
  available: readonly string[],
  requested: readonly string[] | null,
  errors: CliError[],
): readonly string[] {
  if (requested === null) return available;
  const unknown = requested.filter((name) => !available.includes(name));
  for (const name of unknown) {
    errors.push(FUD0446({ name, available }));
  }
  return requested.filter((name) => available.includes(name));
}

/** A human title from the route: `/` → Home, `blog/:slug` → Blog. */
function titleOf(route: string): string {
  const segments = route.split('/').filter((part) => part !== '' && !part.startsWith(':') && !part.startsWith('['));
  const last = segments.at(-1);
  if (last === undefined) return 'Home';
  return last.charAt(0).toUpperCase() + last.slice(1);
}
