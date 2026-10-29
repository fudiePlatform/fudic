/**
 * Control-flow constructs (SDD-06). Canonical re-export.
 */

export type {
  ControlNode,
  ControlConstruct,
  ControlHeader,
  KeyedNode,
  IfNode,
  ConditionalBranch,
  ForeachNode,
  ForNode,
  WhileNode,
  EmptyBlock,
  LoopNode,
  SwitchNode,
  SwitchCase,
  AwaitNode,
  CatchBlock,
} from './nodes.js';
export { keyExpression } from './nodes.js';
export { parseControl } from './control.js';
