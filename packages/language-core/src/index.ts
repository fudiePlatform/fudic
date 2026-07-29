/**
 * Entry point of `@fudic/language-core` — the virtual TypeScript emitter of SDD-23.
 *
 * Given the AST of a `.fud`, produce synthetic TypeScript and CSS plus the offset mapping
 * back to the source, so the existing language services (TypeScript, CSS) supply the
 * intelligence and this project supplies only the projection.
 */

export const VERSION = '0.0.1';

export type { VirtualFile, Mapping, MappingCaps, FileRegistry } from './types.js';
export { USER_CAPS, SCAFFOLD_CAPS, DIAGNOSTIC_ONLY_CAPS } from './caps.js';
export { GLOBALS_DTS, GLOBALS_FILE_NAME } from './globals.js';
export { emitVirtualFiles, type EmitInput } from './emit.js';
export {
  clientFileName,
  serverFileName,
  styleFileName,
  serverModuleSpecifier,
  componentModuleSpecifier,
} from './paths.js';
