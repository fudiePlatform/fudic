/**
 * Entry point of `@fudic/typecheck` — the one machine that typechecks `.fud` (SDD-35).
 *
 * Two clients: the language server, which shows the errors as the author types, and the Vite
 * plugin, which refuses to build while there is one. They import the same projection recipe,
 * the same Volar language plugin and the same fudic rules, so what the editor marks is what
 * the build fails on — by construction, not by keeping two copies in step.
 */

export const VERSION = '0.0.1';

// The shared machine (§3.1).
export { parseFud, type ParsedFud } from './parse.js';
export {
  batchDocumentJs,
  type DocumentJs,
  type CodeRegion,
  type LoopHeader,
} from './js-batch.js';
export {
  projectFud,
  parseSource,
  projectParsed,
  type ProjectInput,
  type ProjectedFud,
  type ParsedSource,
} from './project.js';
export type { LinkIndex, LinkTarget } from './link-index.js';
export {
  FudIndex,
  describeFud,
  type IndexedFud,
  type DescribeInput,
} from './fud-index.js';
export { createFileRegistry } from './file-registry.js';
export { tagOf, holesOf, layoutHrefOf } from './mode.js';
export { toPosix, dirName, baseName, resolveFrom, relativeHref } from './paths.js';
export {
  nodeFileSystem,
  mountWorkspaceFuds,
  type CheckFs,
  type FudList,
} from './files.js';
export { mountGlobals, GLOBALS_DTS, GLOBALS_FILE_NAME, type GlobalsHost } from './globals.js';
export {
  toCodeInformation,
  toCodeMapping,
  toCodeMappings,
  identityMapping,
} from './mappings.js';
export {
  createFudicVirtualCode,
  snapshotOf,
  styleCodeId,
  ROOT_CODE_ID,
  CLIENT_CODE_ID,
  SERVER_CODE_ID,
  FUD_LANGUAGE_ID,
  type FudicVirtualCode,
} from './virtual-code.js';
export {
  fudLanguagePlugin,
  FUD_EXTRA_FILE_EXTENSIONS,
  type LanguageDeps,
  type FudDocuments,
} from './language-plugin.js';
export { linksOf, attributeOf, type LinkRef } from './links.js';
export { unresolvedHrefs, hrefDiagnostics, type UnresolvedHref } from './href.js';
export { holeDiagnostics, missingSections } from './holes.js';
export { reservedDollarDiagnostics } from './reserved-dollar.js';
export { fudicDiagnostics, semanticDiagnostics } from './fudic-diagnostics.js';

export { propShapes } from './prop-shapes.js';

// The project check (§3.1).
export {
  createProjectChecker,
  type CheckOptions,
  type ProjectChecker,
} from './checker.js';
export {
  compareProblems,
  hasErrors,
  type CheckProblem,
  type CheckReport,
  type ProjectProblem,
} from './report.js';
export { formatProblem, locateProblem, relativePath } from './format.js';
export { INFERRED_OPTIONS, readCommandLine, type CheckCommandLine } from './options.js';
