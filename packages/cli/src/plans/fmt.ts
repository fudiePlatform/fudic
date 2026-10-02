/**
 * `fudic fmt [path…]` (SDD-26 §3).
 *
 * The same binary as the editor. `@fudic/formatter` is called here exactly as the language
 * server calls it — one function, one set of options — because a formatter with two entry
 * points eventually has two answers, and the one the user sees depends on where they were
 * standing.
 *
 * It is a plan like every other command: `plan → apply`, so `--dry-run` shows the diff
 * without writing and `--check` is the same plan read for its size rather than applied.
 * A file that does not parse is reported and left alone (§4.6) — never rewritten from an
 * incomplete tree.
 */

import { format, type FormatOptions } from '@fudic/formatter';
import { FUD0450 } from '@fudic/diagnostics';
import { SPEC_EXTENSION, formatSpec } from '@fudic/spec';
import { absolute, joinPosix, toPosix } from '../paths.js';
import { nodeReadIo, walkFiles, walkFud, type ReadIo } from '../io.js';
import type { CliError, FileChange, FmtOptions, Plan, PlanDiagnostic } from '../types.js';

/** Every `.fud` and `.fudspec` a path argument stands for, relative to `cwd`, in a stable order. */
export function filesOf(paths: readonly string[], opts: FmtOptions, io: ReadIo): readonly string[] {
  const found = new Set<string>();
  for (const path of paths) {
    const rel = toPosix(path);
    const full = absolute(opts.cwd, rel);
    if (io.isDirectory(full)) {
      for (const file of [...walkFud(full, io), ...walkFiles(full, io, SPEC_EXTENSION)]) {
        found.add(rel === '.' ? file : joinPosix(rel, file));
      }
    } else if ((rel.endsWith('.fud') || rel.endsWith(SPEC_EXTENSION)) && io.exists(full)) {
      found.add(rel);
    }
  }
  return [...found].sort();
}

/** The formatter options the CLI carries, as `format` wants them. */
function formatOptions(opts: FmtOptions): Partial<FormatOptions> {
  return {
    printWidth: opts.printWidth,
    tabWidth: opts.tabWidth,
    useTabs: opts.useTabs,
    quote: opts.quote,
    endOfLine: opts.endOfLine,
  };
}

export async function planFmt(
  paths: readonly string[],
  opts: FmtOptions,
  io: ReadIo = nodeReadIo(),
): Promise<Plan> {
  const changes: FileChange[] = [];
  const diagnostics: PlanDiagnostic[] = [];
  const errors: CliError[] = [];

  for (const file of filesOf(paths, opts, io)) {
    const before = io.read(absolute(opts.cwd, file));

    // A `.fudspec` has its own formatter, with no options: its layout is fixed (SDD-53 §4.6).
    if (file.endsWith(SPEC_EXTENSION)) {
      const spec = formatSpec(before);
      if (!spec.ok) errors.push(FUD0450({ file }));
      else if (spec.text !== before) changes.push({ kind: 'modify', path: file, contents: spec.text, before });
      continue;
    }

    const result = await format(before, formatOptions(opts));

    if (!result.ok) {
      for (const diagnostic of result.diagnostics) diagnostics.push({ file, diagnostic });
      errors.push(FUD0450({ file }));
      continue;
    }

    // The notes are things the formatter declined to touch, not reasons to stop: they are
    // reported next to the file they belong to and the file is still written.
    for (const note of result.notes) diagnostics.push({ file, diagnostic: note });
    if (result.text !== before) {
      changes.push({ kind: 'modify', path: file, contents: result.text, before });
    }
  }

  return { changes, commands: [], diagnostics, errors };
}
