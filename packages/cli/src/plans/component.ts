/**
 * `fudic g component <name>` (SDD-22 §4.3, BUG-50 §4.3): a component in a folder of its own,
 * `<dir>/<tag>/`, with what makes it testable from the first minute.
 *
 * Four files: the `.fud` — its single `<style>` unless `--no-style` and its host around an
 * empty shadow template, no `@code` until there is something to write in it —, its unit test
 * (`--skip-test`), its `.fudspec` with one real criterion and the fixture that criterion
 * mounts it with (`--skip-spec`). What is generated passes as it is: `pnpm test` and
 * `pnpm spec` are green right after.
 */

import { tagOf } from '@fudic/config';
import { COMPONENTS_DIR, ROUTES_DIR } from '@fudic/conventions';
import { FUD0444, FUD0445 } from '@fudic/diagnostics';
import { FIXTURE_EXTENSION, SPEC_EXTENSION } from '@fudic/spec';
import { absolute, joinPosix, toPosix } from '../paths.js';
import { hasErrors, parseFud } from '../parse.js';
import { existingTags, libraryTags, targetChange } from '../project.js';
import { resolveTarget, type Target } from '../workspace/target.js';
import { workspaceRoot } from '../workspace/discover.js';
import { componentFixture, componentSpec, componentTest, renderTemplate, styleBlock } from '../templates.js';
import { suggestTag, validateTag } from '../tag.js';
import { wireComponentLink } from '../wire.js';
import { componentLink, librarySpecifier } from '../workspace/link.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, ComponentOptions, FileChange, Plan, PlanDiagnostic } from '../types.js';

/** What keeps an empty `src/components/` in git; the first component makes it pointless. */
const KEEP = '.gitkeep';

/** One file of the component's folder: its name, and what it is for the user. */
interface Piece {
  readonly file: string;
  readonly contents: string;
  readonly what: string;
  /** The command that runs it, when there is one. */
  readonly run?: string;
}

/**
 * The argument is a NAME, and the TARGET PROJECT's prefix turns it into a tag (SDD-41 §4.4,
 * SDD-44 §4.3). An argument that already carries a hyphen is a tag the author wrote and is
 * respected whole: `signal-counter` under `prefix: "app"` is `signal-counter`, not
 * `app-signal-counter`. A project that declares no prefix leaves the argument untouched, and
 * the command is the one it has always been — the full tag, or FUD0440.
 */
export function planComponent(name: string, opts: ComponentOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  // The piece goes to a PROJECT, and the project decides the prefix. Resolving the target
  // first is what makes `cd apps/admin && fudic g component card` produce `ad-card` while
  // `--project ui` from the root produces `ui-card` (§4.3, criteria 7 and 8).
  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: resolved.errors });
  }
  const project = resolved.target;
  const projectName = project.path.slice(project.path.lastIndexOf('/') + 1);

  const tag = tagOf(project.config.prefix, name);
  // Against the project AND against the graph (SDD-43 §4.5): a tag one of this project's
  // libraries already defines is taken, and the only place it shows is the library. Both
  // readers are keyed on the RESOLVED target, not on `cwd` (SDD-44 §4.3): the libraries that
  // matter are the ones the project being written into depends on.
  const suggestion = suggestTag(project.config.prefix, projectName, name);
  const invalid = validateTag(tag, existingTags(project.path, io), libraryTags(project.path, io), suggestion);
  if (invalid !== null) {
    return Promise.resolve({ changes: [], commands: [], diagnostics: [], errors: [invalid] });
  }

  const changes: FileChange[] = [];
  const diagnostics: PlanDiagnostic[] = [];
  const errors: CliError[] = [];

  // `--dir` is relative to the project, whatever folder the command runs in (BUG-50 §3.2).
  const folder = joinPosix(project.dir, opts.dir, tag);
  const file = joinPosix(folder, `${tag}.fud`);
  const runs = scriptOf(project, projectName, io);
  const pieces: Piece[] = [
    {
      file: `${tag}.fud`,
      contents: renderTemplate('component.fud', {
        head: opts.style ? styleBlock() : '',
        tag,
        // Without `--slot` the shadow template is left EMPTY rather than filled with a comment:
        // a placeholder is text the user has to delete before writing anything.
        body: opts.slot ? '    <slot></slot>\n' : '',
      }),
      what: 'the component',
    },
    ...(opts.test ? [{ file: `${tag}.test.ts`, contents: componentTest(tag), what: 'unit test', run: runs('test') }] : []),
    ...(opts.spec
      ? [
          { file: `${tag}${SPEC_EXTENSION}`, contents: componentSpec(tag), what: 'acceptance criteria', run: runs('spec') },
          { file: `${tag}${FIXTURE_EXTENSION}`, contents: componentFixture(tag), what: 'the props the criteria mount it with' },
        ]
      : []),
  ];

  for (const piece of pieces) {
    const target = targetChange(opts.cwd, joinPosix(folder, piece.file), piece.contents, opts.force, io);
    if (target.error !== undefined) errors.push(target.error);
    if (target.change !== undefined) changes.push(target.change);
  }

  for (const into of opts.wireInto) {
    wire(toPosix(into), file, opts, io, changes, diagnostics, errors);
  }

  // The empty folder's placeholder goes with the first component that fills it (BUG-50 §4.9).
  const keep = joinPosix(project.dir, COMPONENTS_DIR, KEEP);
  const deletions = folder.startsWith(`${joinPosix(project.dir, COMPONENTS_DIR)}/`) && io.exists(absolute(opts.cwd, keep)) ? [keep] : [];

  const report = componentReport({
    tag,
    folder,
    pieces,
    compact: toPosix(opts.dir) !== COMPONENTS_DIR,
    underRoutes: `${joinPosix(opts.dir)}/`.startsWith(`${ROUTES_DIR}/`),
    linked: opts.wireInto.map(toPosix),
    ...(project.config.kind === 'lib' ? { specifier: librarySpecifier(file, opts.cwd, io) } : {}),
  });
  return Promise.resolve({ changes, ...(deletions.length > 0 ? { deletions } : {}), commands: [], diagnostics, errors, report });
}

/**
 * How the project runs one of its scripts: from the workspace root with a filter, or in the
 * project itself.
 */
function scriptOf(project: Target, name: string, io: ReadIo): (script: string) => string {
  const inWorkspace = workspaceRoot(project.path, io) !== null;
  return (script) => (inWorkspace ? `pnpm --filter ${name} ${script}` : `pnpm ${script}`);
}

interface ReportInput {
  readonly tag: string;
  readonly folder: string;
  readonly pieces: readonly Piece[];
  /** `--dir` somewhere else: the short form of §6.7. */
  readonly compact: boolean;
  readonly underRoutes: boolean;
  readonly linked: readonly string[];
  /** In a library: how an app links it, when its `exports` say. */
  readonly specifier?: string | undefined;
}

/** What `g component` tells the user (BUG-50 §6.5, §6.7). */
function componentReport(input: ReportInput): readonly string[] {
  const head = `Created <${input.tag}> in ${input.folder}/`;
  const lines = ['', head];
  if (input.compact) {
    const [first, ...rest] = input.pieces;
    lines.push(`  ${[first!.file, ...rest.map((piece) => piece.file.slice(input.tag.length))].join(' · ')}`);
    if (input.underRoutes) lines.push('  A component under src/routes is not a route: only pages are.');
  } else {
    lines.push('');
    // Two spaces at least after the longest name; 24 columns, as §6.5 lays it out, otherwise.
    const width = Math.max(24, ...input.pieces.map((piece) => piece.file.length + 2));
    for (const piece of input.pieces) {
      const described = piece.run === undefined ? piece.what : `${piece.what.padEnd(24)}${piece.run}`;
      lines.push(`  ${piece.file.padEnd(width)}${described}`);
    }
  }
  for (const into of input.linked) lines.push(`  linked from ${into}`);
  if (input.specifier !== undefined) {
    lines.push('', 'Use it in an app', `  <link rel="component" href="${input.specifier}">`);
  }
  return lines;
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
    errors.push(FUD0444({ file: into }));
    return;
  }

  const source = io.read(path);
  const parsed = parseFud(source);
  diagnostics.push(...parsed.diagnostics.map((diagnostic) => ({ file: into, diagnostic })));
  if (hasErrors(parsed.diagnostics)) {
    errors.push(FUD0445({ file: into }));
    return;
  }

  // A path inside one package, the library's name across two (SDD-35): see `workspace/link.ts`.
  const link = componentLink(into, componentFile, opts.cwd, io);
  if ('error' in link) {
    errors.push(link.error);
    return;
  }
  const next = wireComponentLink(source, parsed.doc, link.href);
  if (next === null) return; // already linked: idempotent, not a modification
  changes.push({ kind: 'modify', path: into, contents: next, before: source });
  if (link.dependency !== undefined && !changes.some((change) => change.path === link.dependency!.path)) {
    changes.push(link.dependency);
  }
}
