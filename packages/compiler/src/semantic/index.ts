/**
 * The semantic analysis pass (SDD-12): context-dependent rules the parser could not decide
 * locally — uniqueness, nesting, cross-references, evident type errors. Canonical re-export.
 */

export type {
  SemanticInput,
  ComponentRegistry,
  SemanticModel,
  Analyzer,
  SemanticResult,
} from './model.js';
export { ANALYZERS, analyze } from './analyze.js';
export { walk, documentRoots, documentCode, type TreeVisitor } from './walk.js';
