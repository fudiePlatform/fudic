/**
 * The stock extension: the base `ctx` over the `TermHost`. It goes first, so it ignores the ctx it
 * receives and builds the one every later extension and every term starts from.
 */

import type { Locator } from 'playwright-core';
import { FLAT_TEXT } from './flat-text.js';
import { guardedLocator, unguarded } from './locate.js';
import type { BenchExtension, TermContext, TermHost } from './types.js';

/** Writes an extension with its types: what goes in, what comes out. */
export function defineExtension<In extends TermContext, Out extends In>(
  extension: BenchExtension<In, Out>,
): BenchExtension<In, Out> {
  return extension;
}

/** A page script as a function Playwright can serialize: built here, run there. */
const flatText = new Function('element', `return (${FLAT_TEXT})(element);`) as (element: unknown) => string;

export function stockContext(host: TermHost): TermContext {
  return {
    page: host.page,
    locate: (ref) => guardedLocator(host.page, ref, (located, box) => host.onLocate(located, box)),
    act: (target, gesture) => host.settle(unguarded(target), gesture),
    text: (target: Locator) => target.evaluate(flatText),
  };
}

export const stock: BenchExtension = defineExtension({
  context: (_ctx: TermContext, host: TermHost) => stockContext(host),
});
