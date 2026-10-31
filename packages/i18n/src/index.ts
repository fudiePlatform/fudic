/**
 * `@fudic/i18n` — translations (SDD-58).
 *
 * Three things: `t()`, which the compiler replaces, the runtime pieces, and the catalog. The
 * pipes, `locale` and `format` live in `@fudic/core` (SDD-71): formatting a value is not
 * translating a page.
 */

// Replaced by the compiler in every module of a language's graph.
export { t } from './compiled-away.js';
export type { MessageArg, CompiledMessage, MessagePart } from './compiled.js';

// Runtime pieces. Re-exported here so emitted code imports them from the package itself, and
// the linker answers each name with its published piece (SDD-45).
export { $message, $href } from './runtime/index.js';

// Catalog: used by the compiler, the plugin, the CLI and the language server.
export {
  type Catalog,
  type CatalogEntry,
  type ExtractedMessage,
  messageKey,
  parseCatalog,
  mergeCatalog,
  printCatalog,
  catalogPathOf,
  splitCatalog,
  joinCatalogs,
} from './catalog.js';
export { compileMessage, shapeOf, type MessageShape } from './icu.js';
export type { ParseResult } from './result.js';
