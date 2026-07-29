/**
 * `fudic g page <ruta>` (SDD-22 §4.5): ONE resolved form, never a menu. Offering "with
 * layout / without layout" would push a choice onto the user that only reveals itself as
 * wrong at compile time. The command picks the layout, writes the `rel="layout"` edge and
 * declares the sections the layout can render.
 */

import { cliError, FUD_SECTION_UNKNOWN } from '../diagnostics.js';
import { hrefBetween, joinPosix } from '../paths.js';
import { resolveLayout } from '../layout.js';
import { targetChange } from '../project.js';
import { routeToFile } from '../route.js';
import { indent, renderTemplate, sectionBlocks, serverCodeBlock } from '../templates.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, FileChange, PageOptions, Plan, PlanDiagnostic } from '../types.js';

export function planPage(route: string, opts: PageOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const mapped = routeToFile(route);
  if (mapped.error !== undefined) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [mapped.error] });
  }

  const file = joinPosix(opts.dir, mapped.file);
  const layout = resolveLayout(file, opts.layout, { cwd: opts.cwd, routesDir: opts.dir }, io);
  const diagnostics: PlanDiagnostic[] = [...layout.diagnostics];
  const errors: CliError[] = [...layout.errors];

  const sections = chooseSections(layout.sections, opts.sections, errors);
  if (errors.length > 0) return Promise.resolve({ changes: [], commands: [], diagnostics, errors });

  const contents =
    layout.path === null
      ? renderTemplate('page.fud', {
          lang: 'en',
          title: titleOf(route),
          code: opts.server ? indent(serverCodeBlock(), '    ') : '',
        })
      : renderTemplate('route.fud', {
          layoutHref: hrefBetween(file, layout.path),
          code: opts.server ? serverCodeBlock() : '',
          title: opts.server ? '@data.title' : titleOf(route),
          sections: sectionBlocks(sections),
        });

  const changes: FileChange[] = [];
  const target = targetChange(opts.cwd, file, contents, opts.force, io);
  if (target.error !== undefined) errors.push(target.error);
  if (target.change !== undefined) changes.push(target.change);

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
    errors.push(
      cliError(
        FUD_SECTION_UNKNOWN,
        `the layout declares no @RenderSection(${name})${available.length > 0 ? `; it declares: ${available.join(', ')}` : ''}`,
      ),
    );
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
