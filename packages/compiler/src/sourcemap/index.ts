/**
 * Source maps and `LineMap` (SDD-13). The offset↔position edge and the Source
 * Map v3 generator. Canonical re-export. `LineMap`, `Position` and `Range` live in
 * `@fudic/diagnostics` (SDD-50 §4.1), the one place an offset becomes a line.
 */

export type { Position, Range } from '@fudic/diagnostics';
export { LineMap, rangeOf } from '@fudic/diagnostics';
export type { SourceMapV3, SourceMapOptions } from './sourcemap.js';
export { SourceMapBuilder } from './sourcemap.js';
