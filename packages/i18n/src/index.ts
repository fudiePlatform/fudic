/**
 * `@fudic/i18n` — translations and pipes (SDD-58).
 *
 * Four things: the presets of the pipes, three names the compiler replaces, the runtime
 * pieces, and the catalog.
 */

// Presets: data, legal in the three zones of @code and in .ts.
export { type Pipe, date, number, currency, percent, relativeTime, list } from './pipe.js';

// Replaced by the compiler in every module of a language's graph.
export { locale, t, format } from './compiled-away.js';
export type { MessageArg, CompiledMessage, MessagePart } from './compiled.js';

// Runtime pieces. Re-exported here so emitted code imports them from the package itself, and
// the linker answers each name with its published piece (SDD-45).
export { $format, $message, $href } from './runtime/index.js';

// Catalog: used by the compiler, the plugin, the CLI and the language server.
export {
  type Catalog,
  type CatalogEntry,
  type ExtractedMessage,
  messageKey,
  parseCatalog,
  mergeCatalog,
  printCatalog,
} from './catalog.js';
export { compileMessage, shapeOf, type MessageShape } from './icu.js';
export type { ParseResult } from './result.js';
