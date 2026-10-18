/**
 * `fudic g layout <nombre>` (SDD-22 §3.1): a shell with exactly one `@RenderBody()`
 * (decision 86), a `@RenderHead()` unless `--no-head`, and one `@RenderSection(name)` per
 * requested section — a bare identifier, never a string (decision 85).
 */

import { LAYOUTS_DIR, ROUTES_DIR } from '@fudic/conventions';
import { hrefBetween, joinPosix, toPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { resolveTarget } from '../workspace/target.js';
import { workspaceRoot } from '../workspace/discover.js';
import { libraryExport } from '../workspace/link.js';
import { layoutTest, renderSectionBlocks, renderTemplate } from '../templates.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, FileChange, LayoutOptions, Plan } from '../types.js';

export function planLayout(name: string, opts: LayoutOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: resolved.errors });
  }
  const project = resolved.target;
  const projectName = project.path.slice(project.path.lastIndexOf('/') + 1);

  // A layout in a LIBRARY is legal, and deliberately so: since SDD-40 a layout declares
  // props, which makes it a shareable piece with a point — the common shell of several
  // apps. It is the page that cannot live there (§4.8).
  const folder = joinPosix(project.dir, opts.dir);
  const file = joinPosix(folder, `${name}.fud`);
  const contents = renderTemplate('layout.fud', {
    lang: 'en',
    renderHead: opts.head ? '    @RenderHead()' : '',
    sections: renderSectionBlocks(opts.sections),
  });

  const changes: FileChange[] = [];
  const errors: CliError[] = [];
  const target = targetChange(opts.cwd, file, contents, opts.force, io);
  if (target.error !== undefined) errors.push(target.error);
  if (target.change !== undefined) changes.push(target.change);

  // Its unit test beside it, unless `--skip-test` (BUG-50 §4.4).
  if (opts.test) {
    const test = targetChange(opts.cwd, joinPosix(folder, `${name}.test.ts`), layoutTest(`${name}.fud`), opts.force, io);
    if (test.error !== undefined) errors.push(test.error);
    if (test.change !== undefined) changes.push(test.change);
  }

  // In a library, what an app writes to use it — and, in `src/layouts/` of a library made
  // before its `exports` published layouts, the rule that lets it.
  const lib = project.config.kind === 'lib';
  const shared = lib ? libraryExport(project.path, file, opts.cwd, io, { folder: 'layouts', inFolder: toPosix(opts.dir) === LAYOUTS_DIR }) : {};
  if (shared.change !== undefined) changes.push(shared.change);
  // In an app, the href a page directly under src/routes writes.
  const href = lib ? shared.specifier : hrefBetween(joinPosix(project.dir, ROUTES_DIR, 'index.fud'), file);

  const run = workspaceRoot(project.path, io) !== null ? `pnpm --filter ${projectName} test` : 'pnpm test';
  const report = layoutReport({ name, folder, test: opts.test, run, exported: shared.change !== undefined, lib, href });
  return Promise.resolve({ changes, commands: [], diagnostics: [], errors, report });
}

interface ReportInput {
  readonly name: string;
  readonly folder: string;
  readonly test: boolean;
  /** How the project runs its unit tests. */
  readonly run: string;
  /** The library's `package.json` gained the layouts rule. */
  readonly exported: boolean;
  readonly lib: boolean;
  /** How a page links it; in a library, only when its `exports` say. */
  readonly href: string | undefined;
}

/** What `g layout` tells the user: the files, and the `<link>` that uses it. */
function layoutReport(input: ReportInput): readonly string[] {
  const lines = ['', `Created layout ${input.name} in ${input.folder}/`, ''];
  const files: [string, string][] = [[`${input.name}.fud`, 'the layout']];
  if (input.test) files.push([`${input.name}.test.ts`, `unit test               ${input.run}`]);
  if (input.exported) files.push(['package.json', 'exports ./layouts/*.fud, so apps can link it']);
  const width = Math.max(24, ...files.map(([file]) => file.length + 2));
  for (const [file, what] of files) lines.push(`  ${file.padEnd(width)}${what}`);

  if (input.href === undefined) {
    lines.push('', 'No app can link it yet: add its folder to "exports" in package.json');
  } else {
    const where = input.lib ? 'a page of an app that uses this library' : 'a page of src/routes';
    lines.push('', `Use it from ${where}`, `  <link rel="layout" href="${input.href}">`);
  }
  return lines;
}
