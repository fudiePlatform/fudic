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
export {
  linksOf,
  attributeOf,
  attributeValueSpan,
  hrefContextAt,
  tagContextAt,
  sectionContextAt,
  type LinkRef,
  type HrefContext,
  type PartialName,
} from './services/position.js';
export {
  hrefCompletions,
  hrefDiagnostics,
  unresolvedHrefs,
  type HrefCompletion,
  type UnresolvedHref,
} from './services/href.js';
export {
  declaredTags,
  documentLinks,
  type TagCompletion,
  type DocumentLinkRef,
} from './services/tags.js';
export { sectionCompletions } from './services/sections.js';
export { reservedDollarDiagnostics } from './services/reserved-dollar.js';
export { fudicDiagnostics, semanticDiagnostics } from './services/compiler-diagnostics.js';
export { semanticTokens, keywordSpanAt, type FudicToken } from './services/semantic-tokens.js';
export {
  createFudicService,
  createFudicTagService,
  rangeOf,
  toLspDiagnostic,
  fudicDocumentOf,
} from './services/plugin.js';
export { RequestStats, type RequestCounts, type RequestKind } from './stats.js';
export { loadTypeScript, hasTypeScript, DEFAULT_LOADERS, type TypeScriptSource, type TsdkLoaders } from './tsdk.js';
export { mountGlobals, GLOBALS_DTS, GLOBALS_FILE_NAME } from './globals.js';
export {
  VIRTUAL_FILES_REQUEST,
  COMPONENT_REGISTRY_REQUEST,
  AUTO_CLOSE_TAG_REQUEST,
  virtualFilesPayload,
  componentRegistryPayload,
  autoCloseTagPayload,
  type VirtualFilePayload,
  type ComponentPayload,
} from './requests.js';
export {
  createFudicServer,
  type FudicServer,
  type FudicServerDeps,
  type VolarServer,
} from './server.js';
export { main, parseTransport, type Transport, type CliDeps } from './cli.js';
