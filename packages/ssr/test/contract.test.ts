import { describe, it, expectTypeOf } from 'vitest';
import { type Dom, type DomClient } from '@fudic/dom';
import { SsrDom, type SsrNode } from '../src/index.js';

/**
 * Type-level segregation (SDD-14 §6.4), the complement of the assertion in
 * `@fudic/dom`: `SsrDom` satisfies the build contract but NOT the client one.
 * Checked by `tsc`, not at runtime — it locks the ISP/LSP split so a future
 * throwing stub cannot sneak back in.
 */
describe('contract segregation', () => {
  it('SsrDom implements the build contract', () => {
    const build: Dom<SsrNode> = new SsrDom();
    expectTypeOf(build).toExtend<Dom<SsrNode>>();
  });

  it('SsrDom does NOT implement the client contract', () => {
    // @ts-expect-error SsrDom has no traversal or reactive mutation to offer.
    const client: DomClient<SsrNode> = new SsrDom();
    void client;
  });
});
