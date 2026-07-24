/**
 * Source maps and `LineMap` (SDD-13). The offset↔position edge and the Source
 * Map v3 generator. Canonical re-export.
 */

export type { Position, Range } from './position.js';
export { LineMap, rangeOf } from './linemap.js';
export type { SourceMapV3, SourceMapOptions } from './sourcemap.js';
export { SourceMapBuilder } from './sourcemap.js';
