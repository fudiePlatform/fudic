/**
 * The compiler options of a check (SDD-35 §4.2): the project's own, read the way the editor
 * reads them, or — with no `tsconfig.json` — the ones the editor infers for a loose folder.
 */

import type * as ts from 'typescript';
import { toPosix } from './paths.js';

/**
 * What Volar's language server infers for a folder with no `tsconfig.json`, with the editor's
 * default settings (`getInferredCompilerOptions` in `@volar/language-server`).
 *
 * Written out as a constant because reading them from Volar means depending on its language
 * server, which this package must not do (§5.8). A test compares the two, so the copy cannot
 * drift without someone noticing.
 */
export const INFERRED_OPTIONS: ts.CompilerOptions = {
  module: 1, // CommonJS
  target: 7, // ES2020
  jsx: 1, // Preserve
  strictFunctionTypes: true,
  sourceMap: true,
  allowJs: true,
  allowSyntheticDefaultImports: true,
  allowNonTsExtensions: true,
  resolveJsonModule: true,
};

/** The command line a check runs with. */
export interface CheckCommandLine {
  readonly options: ts.CompilerOptions;
  readonly fileNames: readonly string[];
  readonly projectReferences: readonly ts.ProjectReference[] | undefined;
  /**
   * The `tsconfig.json` it came from, absent when there was none.
   *
   * Errors in the file itself are not carried: the editor does not report them over a `.fud`
   * either, and `tsc` is where a broken `tsconfig.json` is said.
   */
  readonly configFile?: string;
}

/**
 * The options from the `tsconfig.json` nearest to `root`, or the inferred ones.
 *
 * Parsed with the `.fud` extension registered — so `include: ["**\/*.fud"]` matches — then
 * with `outDir` dropped and `noEmit` forced, as Volar does: the check emits nothing.
 */
export function readCommandLine(
  typescript: typeof ts,
  root: string,
  extraFileExtensions: readonly ts.FileExtensionInfo[],
): CheckCommandLine {
  const configFile = typescript.findConfigFile(root, typescript.sys.fileExists, 'tsconfig.json');
  if (configFile === undefined) {
    return { options: { ...INFERRED_OPTIONS, noEmit: true }, fileNames: [], projectReferences: undefined };
  }

  const config = typescript.readJsonConfigFile(configFile, typescript.sys.readFile);
  const parsed = typescript.parseJsonSourceFileConfigFileContent(
    config,
    typescript.sys,
    toPosix(configFile).replace(/\/[^/]*$/, ''),
    {},
    configFile,
    undefined,
    extraFileExtensions,
  );
  const { outDir: _outDir, ...options } = parsed.options;
  return {
    options: { ...options, noEmit: true },
    fileNames: parsed.fileNames.map(toPosix),
    projectReferences: parsed.projectReferences,
    configFile: toPosix(configFile),
  };
}
