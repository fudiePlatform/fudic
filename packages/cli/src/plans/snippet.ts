/**
 * `fudic g snippet <file> <name>`: a snippet, added to a file of snippets.
 *
 * A snippet lives in a file with others (`src/snippets/ui.fud`), so the first one creates the
 * file and the next ones go to its end. Each gets its unit test, a `renderSnippet` added to the
 * file's own `.test.ts`. The command ends with what a page or a component writes to use it: the
 * `<link rel="snippet">` — by the package's name when the file is in a library — and the
 * `@render`.
 */

import { FUD0458, FUD0459 } from '@fudic/diagnostics';
import { ROUTES_DIR } from '@fudic/conventions';
import { absolute, hrefBetween, joinPosix, toPosix } from '../paths.js';
import { parseFud } from '../parse.js';
import { targetChange } from '../project.js';
import { renderTemplate } from '../templates.js';
import { resolveTarget } from '../workspace/target.js';
import { workspaceRoot } from '../workspace/discover.js';
import { libraryExport } from '../workspace/link.js';
import { nodeReadIo, type ReadIo } from '../io.js';
import type { CliError, FileChange, Plan, SnippetOptions } from '../types.js';

import { SNIPPETS_DIR } from '../dirs.js';

export { SNIPPETS_DIR };

/** A snippet's name: what the grammar takes in a `@snippet` header. */
const SNIPPET_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/u;
/** A snippet file's name: kebab-case. */
const FILE_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;

const refused = (errors: readonly CliError[]): Promise<Plan> =>
  Promise.resolve({ changes: [], commands: [], diagnostics: [], errors });

export function planSnippet(name: string, opts: SnippetOptions, io: ReadIo = nodeReadIo()): Promise<Plan> {
  const invalid = [
    ...(SNIPPET_NAME.test(name) ? [] : [FUD0458({ what: 'snippet', name })]),
    ...(FILE_NAME.test(opts.file) ? [] : [FUD0458({ what: 'file', name: opts.file })]),
  ];
  if (invalid.length > 0) return refused(invalid);

  const resolved = resolveTarget(opts, io);
  if (resolved.target === undefined) return refused(resolved.errors);
  const project = resolved.target;
  const projectName = project.path.slice(project.path.lastIndexOf('/') + 1);

  const folder = joinPosix(project.dir, opts.dir);
  const file = joinPosix(folder, `${opts.file}.fud`);
  const snippet = renderTemplate('snippet.fud', { name });

  const changes: FileChange[] = [];
  const existing = io.exists(absolute(opts.cwd, file)) ? io.read(absolute(opts.cwd, file)) : undefined;
  if (existing === undefined) {
    const created = targetChange(opts.cwd, file, snippet, false, io);
    changes.push(created.change!);
  } else {
    const doc = parseFud(existing).doc;
    if (doc.type !== 'snippet-document') return refused([FUD0459({ file, reason: 'not-snippets', name })]);
    if (doc.snippets.some((declared) => declared.name === name)) return refused([FUD0459({ file, reason: 'taken', name })]);
    changes.push({ kind: 'modify', path: file, contents: `${existing.trimEnd()}\n\n${snippet}`, before: existing });
  }

  if (opts.test) {
    const testFile = joinPosix(folder, `${opts.file}.test.ts`);
    const testCase = renderTemplate('snippet-case.test.ts.tmpl', { name, file: `${opts.file}.fud` });
    const path = absolute(opts.cwd, testFile);
    if (io.exists(path)) {
      const before = io.read(path);
      // A test file the author started without the import gets it, or the case would not run.
      const head = before.includes('renderSnippet') ? '' : "import { renderSnippet } from '@fudic/testing';\n";
      changes.push({ kind: 'modify', path: testFile, contents: `${head}${before.trimEnd()}\n${testCase}`, before });
    } else {
      changes.push(targetChange(opts.cwd, testFile, `${renderTemplate('snippet.test.ts.tmpl', {})}${testCase}`, false, io).change!);
    }
  }

  // In a library, by the package's name — and, in `src/snippets/` of a library made before its
  // `exports` published snippets, with the rule that lets it. In an app, the path from a page.
  const lib = project.config.kind === 'lib';
  const shared = lib ? libraryExport(project.path, file, opts.cwd, io, { folder: 'snippets', inFolder: toPosix(opts.dir) === SNIPPETS_DIR }) : {};
  if (shared.change !== undefined) changes.push(shared.change);
  const href = lib ? shared.specifier : hrefBetween(joinPosix(project.dir, ROUTES_DIR, 'index.fud'), file);

  const run = workspaceRoot(project.path, io) !== null ? `pnpm --filter ${projectName} test` : 'pnpm test';
  return Promise.resolve({
    changes,
    commands: [],
    diagnostics: [],
    errors: [],
    report: snippetReport({ name, file, added: existing !== undefined, test: opts.test, run, exported: shared.change !== undefined, lib, href }),
  });
}

interface ReportInput {
  readonly name: string;
  readonly file: string;
  /** The file was there, and the snippet went to its end. */
  readonly added: boolean;
  readonly test: boolean;
  readonly run: string;
  /** The library's `package.json` gained the snippets rule. */
  readonly exported: boolean;
  readonly lib: boolean;
  /** How a page links the file; in a library, only when its `exports` say. */
  readonly href: string | undefined;
}

/** What `g snippet` tells the user: where it went, its test, and how to use it. */
function snippetReport(r: ReportInput): readonly string[] {
  const base = r.file.slice(r.file.lastIndexOf('/') + 1);
  const lines = ['', `${r.added ? 'Added' : 'Created'} snippet ${r.name} in ${r.file}`, ''];
  const files: [string, string][] = [[base, r.added ? 'the snippet, at the end of the file' : 'the snippet file']];
  if (r.test) files.push([base.replace(/\.fud$/u, '.test.ts'), `unit test               ${r.run}`]);
  if (r.exported) files.push(['package.json', 'exports ./snippets/*.fud, so apps can link it']);
  const width = Math.max(24, ...files.map(([name]) => name.length + 2));
  for (const [name, what] of files) lines.push(`  ${name.padEnd(width)}${what}`);

  if (r.href === undefined) {
    lines.push('', 'No app can link it yet: add its folder to "exports" in package.json');
    return lines;
  }
  const where = r.lib ? 'a page or a component of an app that uses this library' : 'a page of src/routes';
  lines.push('', `Use it from ${where}`, `  <link rel="snippet" href="${r.href}">`, `  @render ${r.name}()`);
  return lines;
}
