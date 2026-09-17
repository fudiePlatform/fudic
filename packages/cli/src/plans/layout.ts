/**
 * `fudic g layout <nombre>` (SDD-22 §3.1): a shell with exactly one `@RenderBody()`
 * (decision 86), a `@RenderHead()` unless `--no-head`, and one `@RenderSection(name)` per
 * requested section — a bare identifier, never a string (decision 85).
 */

import { joinPosix } from '../paths.js';
import { targetChange } from '../project.js';
import { resolveTarget } from '../workspace/target.js';
import { renderSectionBlocks, renderTemplate } from '../templates.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, FileChange, LayoutOptions, Plan } from '../types.js';

export function planLayout(name: string, opts: LayoutOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: resolved.errors });
  }

  // A layout in a LIBRARY is legal, and deliberately so: since SDD-40 a layout declares
  // props, which makes it a shareable piece with a point — the common shell of several
  // apps. It is the page that cannot live there (§4.8).
  const file = joinPosix(resolved.target.dir, opts.dir, `${name}.fud`);
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

  return Promise.resolve({ changes, commands: [], diagnostics: [], errors });
}
