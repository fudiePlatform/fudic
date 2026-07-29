/**
 * `fudic g component <tag>` (SDD-22 §4.3): a component in N1 — markup and, unless
 * `--no-style`, its single `<style>`. No `@code`, and no flag to force a level: the
 * effective level is inferred by the compiler, and a flag that overrides it is a way to
 * lie to that inference.
 */

import { cliError, FUD_WIRE_TARGET_BROKEN, FUD_WIRE_TARGET_MISSING } from '../diagnostics.js';
import { absolute, hrefBetween, joinPosix, toPosix } from '../paths.js';
import { hasErrors, parseFud } from '../parse.js';
import { existingTags, targetChange } from '../project.js';
import { renderTemplate, styleBlock } from '../templates.js';
import { validateTag } from '../tag.js';
import { wireComponentLink } from '../wire.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, ComponentOptions, FileChange, Plan, PlanDiagnostic } from '../types.js';

export function planComponent(tag: string, opts: ComponentOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const invalid = validateTag(tag, existingTags(opts.cwd, io));
  if (invalid !== null) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [invalid] });
  }

  const changes: FileChange[] = [];
  const diagnostics: PlanDiagnostic[] = [];
  const errors: CliError[] = [];

  const file = joinPosix(opts.dir, `${tag}.fud`);
  const contents = renderTemplate('component.fud', {
    head: opts.style ? styleBlock(tag) : '',
    tag,
    className: tag,
    body: opts.slot ? '      <slot></slot>' : `      <!-- ${tag} markup -->`,
  });

  const target = targetChange(opts.cwd, file, contents, opts.force, io);
  if (target.error !== undefined) errors.push(target.error);
  if (target.change !== undefined) changes.push(target.change);

  for (const into of opts.wireInto) {
    wire(toPosix(into), file, opts, io, changes, diagnostics, errors);
  }

  return Promise.resolve({ changes, commands: [], diagnostics, errors });
}

/** Wire the new component into one existing file. Never edits a file that does not parse. */
function wire(
  into: string,
  componentFile: string,
  opts: ComponentOptions,
  io: ReadIo,
  changes: FileChange[],
  diagnostics: PlanDiagnostic[],
  errors: CliError[],
): void {
  const path = absolute(opts.cwd, into);
  if (!io.exists(path)) {
    errors.push(cliError(FUD_WIRE_TARGET_MISSING, `--in ${into}: no such file`, into));
    return;
  }

  const source = io.read(path);
  const parsed = parseFud(source);
  diagnostics.push(...parsed.diagnostics.map((diagnostic) => ({ file: into, diagnostic })));
  if (hasErrors(parsed.diagnostics)) {
    errors.push(cliError(FUD_WIRE_TARGET_BROKEN, `--in ${into}: the file does not parse; it was left untouched`, into));
    return;
  }

  const next = wireComponentLink(source, parsed.doc, hrefBetween(into, componentFile));
  if (next === null) return; // already linked: idempotent, not a modification
  changes.push({ kind: 'modify', path: into, contents: next, before: source });
}
