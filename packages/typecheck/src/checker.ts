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
import { baselineContextOf } from '@fudic/config';
import { fudBaselineDiagnostics, moduleBaselineDiagnostics } from './baseline.js';
import { fudTrustedTypesDiagnostics, moduleTrustedTypesDiagnostics, requiresTrustedTypes } from './trusted-types.js';
import {
  packageBaselineUses,
  packageModules,
  projectBaselineDiagnostics,
  type BaselineLibrary,
  type BaselinePackage,
  type BaselineSite,
} from './baseline-project.js';
import { findLibraries } from '@fudic/resolve';
import { governFile, projectPolicies } from './govern.js';
import { headersDiagnostics } from './headers.js';
import { mountGlobals } from './globals.js';
import { echoes } from './one-voice.js';
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
import type { ComponentInfo, PropField } from '@fudic/spec';
import { CONFIG_FILE, type ProjectConfig } from '@fudic/config';
import { propShapes } from './prop-shapes.js';
import { portableTypeDiagnostics } from './portable-types.js';
import { apiDiagnostics, readApiProject } from './api-project.js';
import { specDiagnostics } from './spec-problems.js';

/** What a project check is made over. */
export interface CheckOptions {
  /** The project root: where the `.fud` are swept and the `tsconfig.json` is looked for. */
  readonly root: string;
  /** The TypeScript to check with. Defaults to the one this package ships (§7). */
  readonly typescript?: typeof ts;
  /**
   * Whether the three `.headers` of the app are checked too (SDD-84 §3.8): what `fudic_check` asks.
   * Off by default, because `dev` already says them as they change, and the build as it reads them.
   */
  readonly headers?: boolean;
}

export interface ProjectChecker {
  /** Check the whole project. Reuses the previous program when there is one. */
  check(): CheckReport;
  /** A file changed, appeared or went away: the next `check()` re-reads it. */
  invalidate(path: string): void;
  /** The props of the component in `file`, as shapes (SDD-53 §3.3); undefined when unreadable. */
  propShapes(file: string): readonly PropField[] | undefined;
  /**
   * The TypeScript service of the check, once it has run: what a repair outside the editor asks
   * a type of — the element of a loop — without building a second program.
   */
  languageService(): ts.LanguageService | undefined;
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
  /** The component behind each `.fud` a `.fudspec` names, kept while its text is the same. */
  readonly components: Map<string, { readonly source: string; readonly info: ComponentInfo | undefined }>;
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
      components: new Map(),
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

  /** The `.fud` at `path` as the program holds it, projected; undefined when it holds none. */
  const projectedOf = (state: Mounted, path: string): ProjectedFud | undefined =>
    (state.language.scripts.get(path)?.generated?.root as FudicVirtualCode | undefined)?.document;

  /** The `.fud` of `paths` the program holds, projected. */
  const projectedAll = (state: Mounted, paths: Iterable<string>): ProjectedFud[] =>
    [...paths].flatMap((path) => {
      const fud = projectedOf(state, toPosix(path));
      return fud === undefined ? [] : [fud];
    });

  /**
   * `FUD1526` and `FUD1528` (SDD-83 §3.8, §4.1): what the project's own files and its libraries
   * use of the browser, against its `fudic.json`. Nothing when the project has none.
   */
  const projectBaseline = (
    state: Mounted,
    site: BaselineSite,
    config: ProjectConfig | null,
    own: BaselinePackage,
  ): readonly CheckProblem[] => {
    if (config === null) return [];
    const libraries: BaselineLibrary[] = findLibraries(root, fs).map((library) => ({
      name: library.name === '' ? library.root : library.name,
      uses: () =>
        packageBaselineUses(site, { root: library.root, config: library.config, fuds: projectedAll(state, library.files) }),
    }));
    const file = `${root}/${CONFIG_FILE}`;
    const found = projectBaselineDiagnostics(config, () => packageBaselineUses(site, own), libraries);
    // A `fudic.json` has no comments: only its own policy says how these are reported. With no
    // `"baseline"` written, a `FUD1526` is about the whole file, and starts it.
    const located = found.map((d) => ({ ...d, file, span: d.span ?? { start: 0, end: 0 } }));
    // The file is there: its project was read from it.
    const said = governFile(file, fs.readFile(file)!, located, config.diagnostics);
    return fudicProblems(file, said, new Map());
  };

  const collect = (state: Mounted): CheckReport => {
    const program = state.service.getProgram();
    if (program === undefined) throw new Error('TypeScript built no program');
    const declarations = Boolean(program.getCompilerOptions().declaration || program.getCompilerOptions().composite);

    const problems: CheckProblem[] = [];
    /** The problems already reported in a file that is not the `.fud` being collected. */
    const elsewhere = new Map<string, string[]>();
    // Read again on every check: a `fudic.json` edited in `dev` reports differently at once.
    const policies = projectPolicies((path) => fs.readFile(path));
    // Whether a file's pages require trusted types (SDD-84 §4.6), once per project.
    const trusted = new Map<string, boolean>();
    const requiresTrusted = (file: string): boolean => {
      const project = policies.projectOf(file);
      if (project === null) return false;
      if (!trusted.has(project.root)) trusted.set(project.root, requiresTrustedTypes(project, (path) => fs.readFile(path)));
      return trusted.get(project.root)!;
    };
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
      // What the project asks of the browser: `widely` when its `fudic.json` says nothing (SDD-83 §3.4).
      const baseline = baselineContextOf(policies.projectOf(entry.path)?.config ?? null);
      // Everything fudic says of the file, under its project's policy and its own comments.
      const said = governFile(
        entry.path,
        root.document.source,
        [
          ...fudicDiagnostics(root.document, state.index, baseline),
          ...portableTypeDiagnostics(program, root.document),
          ...fudBaselineDiagnostics(program, root.document, baseline),
          ...(requiresTrusted(entry.path) ? fudTrustedTypesDiagnostics(program, root.document) : []),
        ],
        policies.policyOf(entry.path),
        { parsed: root.document, complete: true },
      );
      const own = fudicProblems(entry.path, said, elsewhere);
      // One fact, one voice: TypeScript is silent where a fudic error of this file speaks.
      const spoken = own.filter((p) => p.file === entry.path && p.severity === 'error').map((p) => p.span);
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
          if (echoes({ start, end }, spoken)) break;
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

      problems.push(...own);
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

    // The modules the browser loads, against the Baseline of their project (SDD-83 §3.6).
    const config = policies.projectOf(`${root}/${CONFIG_FILE}`)?.config ?? null;
    const site: BaselineSite = { typescript, program, readFile: (path) => fs.readFile(path) };
    // The project itself as a package: its own `.fud`, never a library's.
    const own: BaselinePackage = {
      root,
      config,
      fuds: projectedAll(state, state.index.all().filter((entry) => !entry.external).map((entry) => entry.path)),
    };
    for (const file of packageModules(site, own)) {
      const baseline = baselineContextOf(policies.projectOf(file)?.config ?? null);
      const found = [
        ...moduleBaselineDiagnostics(program, file, baseline),
        ...(requiresTrusted(file) ? moduleTrustedTypesDiagnostics(program, file) : []),
      ];
      const source = program.getSourceFile(file)!.text;
      // A module with nothing to say and no `fud-disable` is not read for its comments.
      if (found.length === 0 && !source.includes('fud-disable')) continue;
      const said = governFile(file, source, found, policies.policyOf(file), { complete: true });
      problems.push(...fudicProblems(file, said, elsewhere));
    }

    // What the parser and the validator say of each `.fudapi` of the app and each `.fudspec`: the
    // build reports them here, once, with everything else.
    const api = readApiProject(root);
    const specs = specDiagnostics(root, fs, state.index, api, state.components);
    for (const { file, source, diagnostics } of [...apiDiagnostics(root, api), ...specs.files]) {
      const said = governFile(file, source, diagnostics, policies.policyOf(file), { complete: true });
      problems.push(...fudicProblems(file, said, elsewhere));
    }
    // The `.headers` of the app, as the build reads them (SDD-84 §3.8).
    if (options.headers === true) {
      for (const said of headersDiagnostics(root, (path) => fs.readFile(path), policies)) {
        problems.push(...fudicProblems(said.file!, [said], elsewhere));
      }
    }
    // What the project as a whole says of its Baseline: its libraries, and an `allow` nothing uses.
    problems.push(...projectBaseline(state, site, config, own));

    const read = [...api.sources.filter((s) => s.origin === 'app').map((s) => s.path), ...specs.read];

    const project: ProjectProblem[] = state.commandLine.configFile === undefined ? [FUD0870()] : [];
    return { problems: problems.sort(compareProblems), project, inputs: [...new Set([...inputs.values(), ...read])] };
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

    languageService() {
      return mounted?.service;
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
