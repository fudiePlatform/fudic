/**
 * The project check (SDD-35 §4.2–§4.6): what the editor marks, over the whole project at once.
 *
 * It is mounted the way the language server mounts its TypeScript project, piece by piece:
 *
 *   - a Volar `Language` with `fudLanguagePlugin`, the same plugin the server registers;
 *   - `createLanguageServiceHost` of `@volar/typescript`, which names the virtuals, resolves
 *     `'./app-badge.fud'` and `typeof import('./x.fud.server')`, and serves the extra script;
 *   - `ts.createLanguageService` over it, alive between checks so a save in `dev` only redoes
 *     what changed;
 *   - and the diagnostics carried back to the `.fud` by Volar's own mapper, filtered with
 *     `shouldReportDiagnostics` — the call the editor makes, with the same arguments.
 *
 * `proxyCreateProgram` is not used, though it is what `vue-tsc` uses: it ignores
 * `getExtraServiceScripts`, so the `.fud.server` virtual would not exist and `$Data` would be
 * `any` here and typed in the editor (§1.3).
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
  type VirtualCode,
} from '@volar/language-core';
import { createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';
import { serverFileName } from '@fudic/language-core';
import { FUD0870, FUD0871 } from '@fudic/diagnostics';
import { nodeFileSystem, type CheckFs } from './files.js';
import { describeFud, FudIndex } from './fud-index.js';
import { fudicDiagnostics } from './fudic-diagnostics.js';
import { mountGlobals } from './globals.js';
import { FUD_EXTRA_FILE_EXTENSIONS, fudLanguagePlugin } from './language-plugin.js';
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

/** What a project check is made over. */
export interface CheckOptions {
  /** The project root: where the `.fud` are swept and the `tsconfig.json` is looked for. */
  readonly root: string;
  /** The TypeScript to check with. Defaults to the one this package ships (§7). */
  readonly typescript?: typeof ts;
}

export interface ProjectChecker {
  /** Check the whole project. Reuses the previous program when there is one. */
  check(): CheckReport;
  /** A file changed, appeared or went away: the next `check()` re-reads it. */
  invalidate(path: string): void;
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
    const { languageServiceHost } = createLanguageServiceHost(typescript, typescript.sys, language, (name) => name, {
      getCurrentDirectory: () => root,
      getProjectVersion: () => String(projectVersion),
      // Every `.fud` of the index, and not only the ones the `tsconfig` lists: a component
      // nobody links yet is red in the editor too (§4.2). The index is the editor's list.
      getScriptFileNames: () => [
        ...new Set([...commandLine.fileNames, ...index.all().map((entry) => entry.path)]),
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
    for (const entry of state.index.all()) {
      // A library's file is in the program for its types and is not the author's to fix (§4.2).
      if (entry.external) continue;
      const script = state.language.scripts.get(entry.path);
      const root = script?.generated?.root as FudicVirtualCode | undefined;
      if (script === undefined || root === undefined) continue;

      const typeErrors = (fileName: string, code: VirtualCode): void => {
        const sourceFile = program.getSourceFile(fileName);
        if (sourceFile === undefined) return;
        const map = state.language.maps.get(code, script);
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
      };
      typeErrors(entry.path, root.client);
      typeErrors(serverFileName(entry.path), root.server);

      for (const diagnostic of fudicDiagnostics(root.document, state.index)) {
        if (diagnostic.severity !== 'error' && diagnostic.severity !== 'warning') continue;
        problems.push({
          file: entry.path,
          span: diagnostic.span,
          severity: diagnostic.severity,
          code: diagnostic.code,
          message: diagnostic.message,
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

/** `error` and `warning` break or warn; suggestions and messages are the editor's grey hints. */
function severityOf(typescript: typeof ts, category: ts.DiagnosticCategory): 'error' | 'warning' | undefined {
  if (category === typescript.DiagnosticCategory.Error) return 'error';
  if (category === typescript.DiagnosticCategory.Warning) return 'warning';
  return undefined;
}
