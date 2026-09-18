/**
 * `fudic g component <tag>` (SDD-22 §4.3): the shape of a component, empty.
 *
 * Its `@code` with a `Props` type and an empty `@client`, its single `<style>` unless
 * `--no-style`, and its host wrapper around an empty shadow template. Nothing else: no
 * placeholder `<div>`, no invented CSS rule, no comment standing in for markup.
 *
 * The `@code` is there for every component, and that is deliberate. Writing the type and the
 * `props<T>()` call by hand is the part that costs, a component that is only markup and style
 * is the rare case, and an empty `@client {}` reclassifies nothing: a component has no level
 * of its own — the client chunk is emitted for every one of them regardless (SDD-15) — so
 * there is no inference here to lie to.
 */

import { tagOf } from '@fudic/config';
import { cliError, FUD_WIRE_TARGET_BROKEN, FUD_WIRE_TARGET_MISSING } from '../diagnostics.js';
import { absolute, hrefBetween, joinPosix, toPosix } from '../paths.js';
import { hasErrors, parseFud } from '../parse.js';
import { existingTags, libraryTags, projectConfig, targetChange } from '../project.js';
import { codeBlock, renderTemplate, styleBlock } from '../templates.js';
import { validateTag } from '../tag.js';
import { wireComponentLink } from '../wire.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, ComponentOptions, FileChange, Plan, PlanDiagnostic } from '../types.js';

/**
 * The argument is a NAME, and the project's prefix turns it into a tag (SDD-41 §4.4). An
 * argument that already carries a hyphen is a tag the author wrote and is respected whole:
 * `signal-counter` under `prefix: "app"` is `signal-counter`, not `app-signal-counter`.
 * Without a `fudic.json`, `tagOf` returns the argument untouched and the command is the
 * one it has always been — the full tag, or FUD0440.
 */
export function planComponent(name: string, opts: ComponentOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const project = projectConfig(opts.cwd, io);
  if (project.diagnostics.length > 0) {
    // A `fudic.json` that does not read is fatal HERE and not elsewhere: the prefix is what
    // decides the tag, so a broken file means the component would be written under a name
    // the author did not choose. Saying so beats writing the wrong file.
    const errors = project.diagnostics.map((entry) => cliError(entry.code, entry.message, entry.file));
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors });
  }

  const tag = tagOf(project.config?.prefix ?? '', name);
  // Against the project AND against the graph (SDD-43 §4.5): a tag one of this project's
  // libraries already defines is taken, and the only place it shows is the library.
  const invalid = validateTag(tag, existingTags(opts.cwd, io), libraryTags(opts.cwd, io));
  if (invalid !== null) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [invalid] });
  }

  const changes: FileChange[] = [];
  const diagnostics: PlanDiagnostic[] = [];
  const errors: CliError[] = [];

  const file = joinPosix(opts.dir, `${tag}.fud`);
  const contents = renderTemplate('component.fud', {
    code: codeBlock(),
    head: opts.style ? styleBlock() : '',
    tag,
    // Without `--slot` the shadow template is left EMPTY rather than filled with a comment:
    // a placeholder is text the user has to delete before writing anything.
    body: opts.slot ? '    <slot></slot>\n' : '',
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
