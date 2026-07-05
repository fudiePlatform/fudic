import { describe, it, expectTypeOf } from 'vitest';
import { browserDom } from '../src/browser.js';
import { type Dom, type DomClient } from '../src/dom.js';

/**
 * Type-level segregation (SDD-14 §6.4). These assertions are checked by `tsc`
 * (the `typecheck` script covers `test/`), not at runtime: they lock the ISP/LSP
 * split so it cannot silently regress. The complementary "SsrDom satisfies Dom
 * but not DomClient" assertion lives in `@fudic/ssr`, where `SsrDom` is defined.
 */
describe('contract segregation', () => {
  it('browserDom implements the client contract', () => {
    expectTypeOf(browserDom).toExtend<DomClient<Node>>();
  });

  it('the client contract extends the build contract', () => {
    expectTypeOf<DomClient<Node>>().toExtend<Dom<Node>>();
  });

  it('the build contract carries no traversal or reactive mutation', () => {
    expectTypeOf<Dom<Node>>().not.toHaveProperty('firstChild');
    expectTypeOf<Dom<Node>>().not.toHaveProperty('setText');
    expectTypeOf<Dom<Node>>().not.toHaveProperty('setProp');
  });
});
