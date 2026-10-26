/**
 * The project check (SDD-35 §4.2–§4.6): what the editor marks, over the whole project at once.
 *
 * It is mounted the way the language server mounts its TypeScript project, piece by piece:
 *
 *   - a Volar `Language` with `fudLanguagePlugin`, the same plugin the server registers;
 *   - `createLanguageServiceHost` of `@volar/typescript`, which names the virtuals and resolves
 *     `'./app-badge.fud'`;
 *   - `ts.createLanguageService` over it, alive between checks so a save in `dev` only redoes
 *     what changed;
 *   - and the diagnostics carried back to the `.fud` by Volar's own mapper, filtered with
 *     `shouldReportDiagnostics` — the call the editor makes, with the same arguments.
 *
 * Nothing in here throws out of `check()`. A check that could not run reports `FUD0871`: an
 * empty report would read as a clean project, and that is the one lie this SDD exists to stop.
 */

import defaultTypeScript from 'typescript';
import type * as ts from 'typescript';
import {
  createLanguage,
  FileMap,
  shouldReportDiagnostics,
  type IScriptSnapshot,
  type Language,
} from '@volar/language-core';
import { createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';
import { FUD0870, FUD0871, type SourceDiagnostic as Diagnostic } from '@fudic/diagnostics';
import { nodeFileSystem, type CheckFs } from './files.js';
import { describeFud, FudIndex } from './fud-index.js';
import { fudicDiagnostics } from './fudic-diagnostics.js';
import { mountGlobals } from './globals.js';
import { FUD_EXTRA_FILE_EXTENSIONS, fudLanguagePlugin } from './language-plugin.js';
import { implementationsOf, type Implementations } from './implementations.js';
import { readCommandLine, type CheckCommandLine } from './options.js';
import { toPosix } from './paths.js';
import { parseSource, projectParsed, type ParsedSource, type ProjectedFud } from './project.js';
import {
  compareProblems,
  type CheckProblem,
  type CheckReport,
  type ProjectProblem,
} from './report.js';
import type { FudicVirtualCode } from './virtual-code.js';
import type { PropField } from '@fudic/spec';
import { propShapes } from './prop-shapes.js';
import { portableTypeDiagnostics } from './portable-types.js';

/** What a project check is made over. */
export interface CheckOptions {
  /** The project root: where the `.fud` are swept and the `tsconfig.json` is looked for. */
  readonly root: string;
  /** The TypeScript to check with. Defaults to the one this package ships (§7). */
  readonly typescript?: typeof ts;
  /**
   * Internal, and temporary: `true` adds the typed pass of SDD-61's portable view. Only the tests
   * set it while the repository migrates; SDD-61 task 36 removes the switch and runs it always.
   */
  readonly portableView?: boolean;
}

export interface ProjectChecker {
  /** Check the whole project. Reuses the previous program when there is one. */
  check(): CheckReport;
  /** A file changed, appeared or went away: the next `check()` re-reads it. */
  invalidate(path: string): void;
  /** The props of the component in `file`, as shapes (SDD-53 §3.3); undefined when unreadable. */
  propShapes(file: string): readonly PropField[] | undefined;
}

/** Everything a check holds between runs. Rebuilt only when the `tsconfig.json` changes. */
interface Mounted {
  readonly index: FudIndex;
  readonly language: Language<string>;
  readonly service: ts.LanguageService;
  readonly commandLine: CheckCommandLine;
  /** The snapshot each file was last read as; `undefined` for a file that is not there. */
  readonly snapshots: Map<string, IScriptSnapshot | undefined>;
  /** The parse of each `.fud`, keyed by its text: a re-projection does not re-parse. */
  readonly parses: Map<string, { readonly source: string; readonly parsed: ParsedSource }>;
  /** The handlers beside the `.fudapi` and their generated types (SDD-60 §4.6). */
  implementations: Implementations;
  bump(): void;
}

/** The project checker over `root`. Nothing is read until the first `check()`. */
export function createProjectChecker(options: CheckOptions, fs: CheckFs = nodeFileSystem()): ProjectChecker {
  const root = toPosix(options.root);
  const typescript = options.typescript ?? defaultTypeScript;
  const caseSensitive = typescript.sys.useCaseSensitiveFileNames;
  const keyOf = (path: string): string => (caseSensitive ? toPosix(path) : toPosix(path).toLowerCase());
  const inputs = new Map<string, string>();
  let mounted: Mounted | undefined;

  const mount = (): Mounted => {
    const index = new FudIndex(fs, describeFud);
    index.scan(root);

    const parses = new Map<string, { readonly source: string; readonly parsed: ParsedSource }>();
    const plugin = fudLanguagePlugin<string>({
      isFud: (id) => id.endsWith('.fud'),
      pathOf: toPosix,
      documents: {
        get(path, _version, source): ProjectedFud {
          const key = keyOf(path);
          let entry = parses.get(key);
          if (entry === undefined || entry.source !== source) {
            entry = { source, parsed: parseSource(source) };
            parses.set(key, entry);
          }
          return projectParsed(path, entry.parsed, index);
        },
        invalidate(path) {
          parses.delete(keyOf(path));
        },
      },
    });

    const commandLine = readCommandLine(typescript, root, [...FUD_EXTRA_FILE_EXTENSIONS]);
    const snapshots = new Map<string, IScriptSnapshot | undefined>();
    const read = (fileName: string): string | undefined =>
      fileName.endsWith('.fud') ? fs.readFile(fileName) : typescript.sys.readFile(fileName);

    const language: Language<string> = createLanguage<string>(
      [plugin, { getLanguageId: (id) => resolveFileLanguageId(id) }],
      new FileMap(caseSensitive),
      (id, includeFsFiles) => {
        const key = keyOf(id);
        if (!snapshots.has(key) && includeFsFiles) {
          const text = read(id);
          snapshots.set(key, text === undefined ? undefined : typescript.ScriptSnapshot.fromString(text));
          if (text !== undefined) inputs.set(key, toPosix(id));
        }
        const snapshot = snapshots.get(key);
        if (snapshot !== undefined) language.scripts.set(id, snapshot);
        else language.scripts.delete(id);
      },
    );

    let projectVersion = 0;
    let implementations = implementationsOf(typescript, root);
    const { languageServiceHost } = createLanguageServiceHost(typescript, typescript.sys, language, (name) => name, {
      getCurrentDirectory: () => root,
      getProjectVersion: () => String(projectVersion),
      // Every `.fud` of the index, and not only the ones the `tsconfig` lists: a component
      // nobody links yet is red in the editor too (§4.2). The index is the editor's list.
      getScriptFileNames: () => [
        ...new Set([...commandLine.fileNames, ...index.all().map((entry) => entry.path), ...implementations.roots]),
      ],
      getCompilationSettings: () => commandLine.options,
      getProjectReferences: () => commandLine.projectReferences,
    });
    mountGlobals(languageServiceHost, root);

    return {
      index,
      language,
      service: typescript.createLanguageService(languageServiceHost),
      commandLine,
      snapshots,
      parses,
      get implementations() {
        return implementations;
      },
      set implementations(next) {
        implementations = next;
      },
      bump: () => {
        projectVersion++;
      },
    };
  };

  const collect = (state: Mounted): CheckReport => {
    const program = state.service.getProgram();
    if (program === undefined) throw new Error('TypeScript built no program');
    const declarations = Boolean(program.getCompilerOptions().declaration || program.getCompilerOptions().composite);

    const problems: CheckProblem[] = [];
    /** The problems already reported in a file that is not the `.fud` being collected. */
    const elsewhere = new Map<string, string[]>();
    for (const entry of state.index.all()) {
      // A library's file is in the program for its types and is not the author's to fix (§4.2).
      if (entry.external) continue;
      const script = state.language.scripts.get(entry.path);
      const root = script?.generated?.root as FudicVirtualCode | undefined;
      if (script === undefined || root === undefined) continue;

      // Every `.fud` of the index is a root of the program (`getScriptFileNames` below), so the
      // script of its client virtual is always there.
      const sourceFile = program.getSourceFile(entry.path)!;
      const map = state.language.maps.get(root.client, script);
      const found = [
        ...program.getSyntacticDiagnostics(sourceFile),
        ...program.getSemanticDiagnostics(sourceFile),
        ...(declarations ? program.getDeclarationDiagnostics(sourceFile) : []),
      ];
      for (const diagnostic of found) {
        const severity = severityOf(typescript, diagnostic.category);
        if (severity === undefined || diagnostic.start === undefined || diagnostic.length === undefined) continue;
        // The editor's mapping, call for call: the first source range whose mapping allows a
        // diagnostic for this source and code. One that lands in scaffolding has none.
        const generatedEnd = diagnostic.start + diagnostic.length;
        for (const [start, end] of map.toSourceRange(diagnostic.start, generatedEnd, true, (data) =>
          shouldReportDiagnostics(data, 'ts', diagnostic.code),
        )) {
          problems.push({
            file: entry.path,
            span: { start, end },
            severity,
            code: `TS${diagnostic.code}`,
            message: typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          });
          break;
        }
      }

      problems.push(...fudicProblems(entry.path, fudicDiagnostics(root.document, state.index), elsewhere));
      if (options.portableView === true) {
        problems.push(...fudicProblems(entry.path, portableTypeDiagnostics(program, root.document), elsewhere));
      }
    }

    // A handler of `src/server` or `src/browser`, in its own `.ts` (SDD-60 §4.6).
    for (const file of state.implementations.sources) {
      const sourceFile = program.getSourceFile(file);
      if (sourceFile === undefined) continue;
      for (const diagnostic of [...program.getSyntacticDiagnostics(sourceFile), ...program.getSemanticDiagnostics(sourceFile)]) {
        const severity = severityOf(typescript, diagnostic.category);
        if (severity === undefined || diagnostic.start === undefined || diagnostic.length === undefined) continue;
        problems.push({
          file,
          span: { start: diagnostic.start, end: diagnostic.start + diagnostic.length },
          severity,
          code: `TS${diagnostic.code}`,
          message: typescript.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        });
      }
    }

    const project: ProjectProblem[] = state.commandLine.configFile === undefined ? [FUD0870()] : [];
    return { problems: problems.sort(compareProblems), project, inputs: [...inputs.values()] };
  };

  return {
    check() {
      try {
        mounted ??= mount();
        return collect(mounted);
      } catch (error) {
        // The state that failed is not trusted for the next run either.
        mounted = undefined;
        const reason = error instanceof Error ? error.message : String(error);
        return { problems: [], project: [FUD0871({ reason })], inputs: [...inputs.values()] };
      }
    },

    propShapes(file) {
      try {
        mounted ??= mount();
        const program = mounted.service.getProgram();
        return program === undefined ? undefined : propShapes(program, toPosix(file));
      } catch {
        // Unreadable is an answer here: the caller writes the fixture without props.
        mounted = undefined;
        return undefined;
      }
    },

    invalidate(path) {
      if (mounted === undefined) return;
      const posix = toPosix(path);
      // The options, the file list and every resolution depend on it: start over.
      if (/(^|\/)tsconfig(\.[^/]*)?\.json$/u.test(posix)) {
        mounted = undefined;
        return;
      }
      const state = mounted;
      state.snapshots.delete(keyOf(posix));
      // A handler or a generated type that appeared or went away changes the file list.
      if (state.implementations.covers(posix)) state.implementations = implementationsOf(typescript, root);
      if (posix.endsWith('.fud')) {
        const before = state.index.revision;
        state.index.upsert(posix);
        // What a tag resolves to changed for every file that links this one, so every `.fud`
        // is projected again — from its cached parse, unless its text changed too.
        if (state.index.revision !== before) {
          for (const entry of state.index.all()) state.snapshots.delete(keyOf(entry.path));
        }
      }
      state.bump();
    },
  };
}

/**
 * The fudic diagnostics of the `.fud` at `path` as problems: errors and warnings only.
 *
 * One located in another file — a store the server cut of the view reached (SDD-61 §3.9) — is a
 * problem of THAT file, reported once however many `.fud` read it, with each of them in its
 * `readBy`: `elsewhere` holds, per place, the readers of the ones already reported in the run.
 */
export function fudicProblems(
  path: string,
  diagnostics: readonly Diagnostic[],
  elsewhere: Map<string, string[]>,
): CheckProblem[] {
  const out: CheckProblem[] = [];
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity !== 'error' && diagnostic.severity !== 'warning') continue;
    const file = diagnostic.file ?? path;
    const problem = { file, span: diagnostic.span, severity: diagnostic.severity, code: diagnostic.code, message: diagnostic.message };
    if (file === path) {
      out.push(problem);
      continue;
    }
    const key = `${file}:${diagnostic.span.start}:${diagnostic.span.end}:${diagnostic.code}`;
    const readers = elsewhere.get(key);
    if (readers !== undefined) {
      readers.push(path);
      continue;
    }
    const readBy = [path];
    elsewhere.set(key, readBy);
    out.push({ ...problem, readBy });
  }
  return out;
}

/** `error` and `warning` break or warn; suggestions and messages are the editor's grey hints. */
function severityOf(typescript: typeof ts, category: ts.DiagnosticCategory): 'error' | 'warning' | undefined {
  if (category === typescript.DiagnosticCategory.Error) return 'error';
  if (category === typescript.DiagnosticCategory.Warning) return 'warning';
  return undefined;
}
