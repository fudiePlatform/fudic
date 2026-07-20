/**
 * The delimiter balancer (SDD-02). Canonical re-export.
 */

export type { LexRegionKind, LexRegion, BalancedGroup, Closer } from './balancer.js';
export { scanBalanced, scanParens, scanBrackets, scanBraces } from './balancer.js';
