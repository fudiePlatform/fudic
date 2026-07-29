/**
 * What every template projector needs, and the recursion hook that keeps them apart.
 *
 * The bodies of `@if`, `@foreach` and `@section` hold markup, so those projectors must
 * re-enter the dispatcher — which lives above them. Injecting the recursion as `emit()`
 * instead of importing it keeps the dependency one-way and the modules independently
 * testable; the alternative is a cycle between the dispatcher and every construct.
 */

import type { HtmlContent } from '@fudic/compiler';
import type { Aliases } from '../imports.js';
import type { VirtualWriter } from '../writer.js';

export interface TemplateContext {
  /** The `.fud` text every verbatim copy is sliced from. */
  readonly source: string;
  readonly w: VirtualWriter;
  /** Contracts in scope: component tags and the layout's section union. */
  readonly aliases: Aliases;
  /** Project a list of children. The dispatcher supplies it. */
  emit(content: readonly HtmlContent[]): void;
}
