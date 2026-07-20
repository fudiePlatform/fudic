/**
 * Control-flow constructs (SDD-06). Canonical re-export.
 */

export type {
  ControlNode,
  ControlHeader,
  IfNode,
  ConditionalBranch,
  ForeachNode,
  ForNode,
  WhileNode,
  SwitchNode,
  SwitchCase,
} from './nodes.js';
export { parseControl } from './control.js';
