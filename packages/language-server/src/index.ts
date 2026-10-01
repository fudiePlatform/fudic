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
// The shared machine moved to `@fudic/typecheck` (SDD-35 §4.1). Re-exported so nobody who
// imported it from here breaks; the code itself exists once, there.
export {
  parseFud,
  tagOf,
  layoutHrefOf,
  createFileRegistry,
  nodeFileSystem,
  toPosix,
  dirName,
  baseName,
  resolveFrom,
  relativeHref,
  batchDocumentJs,
  toCodeInformation,
  toCodeMapping,
  toCodeMappings,
  identityMapping,
  createFudicVirtualCode,
  snapshotOf,
  styleCodeId,
  CLIENT_CODE_ID,
  SERVER_CODE_ID,
  FUD_LANGUAGE_ID,
  mountGlobals,
  GLOBALS_DTS,
  GLOBALS_FILE_NAME,
  unresolvedHrefs,
  hrefDiagnostics,
  reservedDollarDiagnostics,
  fudicDiagnostics,
  semanticDiagnostics,
  type ParsedFud,
  type DocumentJs,
  type CodeRegion,
  type FudicVirtualCode,
  type UnresolvedHref,
} from '@fudic/typecheck';
export { roleOf, type FudRole } from './mode.js';
export { WorkspaceIndex, type IndexEntry } from './workspace-index.js';
export { DocumentCache, type CachedDocument } from './document-cache.js';
export { uriToPath, pathToUri, isFudUri } from './uri.js';
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
export { hrefCompletions, type HrefCompletion } from './services/href.js';
export {
  declaredTags,
  documentLinks,
  type TagCompletion,
  type DocumentLinkRef,
} from './services/tags.js';
export { sectionCompletions } from './services/sections.js';
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
export {
  VIRTUAL_FILES_REQUEST,
  COMPONENT_REGISTRY_REQUEST,
  AUTO_CLOSE_TAG_REQUEST,
  COMMENT_SYNTAX_REQUEST,
  virtualFilesPayload,
  componentRegistryPayload,
  autoCloseTagPayload,
  commentSyntaxPayload,
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
