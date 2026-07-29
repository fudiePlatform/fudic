/**
 * Entry point of `@fudic/language-server` — the LSP server of SDD-24.
 *
 * The intelligence lives elsewhere: SDD-23 projects a `.fud` onto virtual TypeScript and
 * CSS, and the TypeScript, HTML and CSS services answer over that projection. What this
 * package owns is the assembly — which services run, how requests route through the
 * mapping, and when cached state dies.
 *
 * The public surface grows here as the phases land; today it carries the version only.
 */

export const VERSION = '0.0.1';

export type {
  FudicInitializationOptions,
  FudicUserOptions,
  FudicOptions,
  FileSystemScanner,
  Logger,
} from './types.js';
export { DEFAULT_OPTIONS, resolveOptions } from './options.js';
export {
  FUDIC_TOKEN_TYPES,
  SEMANTIC_TOKENS_LEGEND,
  SERVER_CAPABILITIES,
  tokenTypeIndex,
  type FudicTokenType,
} from './capabilities.js';
export {
  FUD_HREF_UNRESOLVED,
  FUD_RESERVED_DOLLAR,
  hrefUnresolved,
  reservedDollar,
} from './diagnostics.js';
export { parseFud, type ParsedFud } from './parse.js';
export { roleOf, tagOf, layoutHrefOf, type FudRole } from './mode.js';
export { WorkspaceIndex, type IndexEntry } from './workspace-index.js';
export { createFileRegistry } from './file-registry.js';
export { nodeFileSystem } from './node-fs.js';
export { toPosix, dirName, baseName, resolveFrom, relativeHref } from './paths.js';
export { batchDocumentJs, type DocumentJs, type CodeRegion } from './js-batch.js';
export { DocumentCache, type CachedDocument } from './document-cache.js';
export { uriToPath, pathToUri, isFudUri } from './uri.js';
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
  CLIENT_CODE_ID,
  SERVER_CODE_ID,
  FUD_LANGUAGE_ID,
  type FudicVirtualCode,
} from './virtual-code.js';
export { createFudicLanguagePlugin } from './language-plugin.js';
