/**
 * Entry point of `@fudic/compiler`.
 *
 * Public API. SDD-01 lands the shared base types — `Span`, `Diagnostic`,
 * `ParseResult`, `Mode`/`ModeStack`, and the `Node` root of the AST. SDD-02 adds
 * the delimiter balancer.
 */

export const VERSION = '0.0.1';

export * from './types/index.js';
export * from './balancer/index.js';
export * from './lexer/index.js';
export * from './at/index.js';
export * from './html/index.js';
