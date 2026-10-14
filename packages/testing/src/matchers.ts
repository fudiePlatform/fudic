/**
 * The matchers `@fudic/testing` adds to `expect` (§3.4, §3.10), registered by the environment.
 */

import { expect } from 'vitest';
import { reaches, type ClientGraph } from './client-graph.js';

interface FudicMatchers<R = unknown> {
  /** The client graph reaches that file, relative to the project root. */
  toReach(path: string): R;
}

declare module 'vitest' {
  // Declared once, for both forms of a matcher; `any` because that is how vitest declares it.
  interface Assertion<T = any> extends FudicMatchers<T> {}
  interface AsymmetricMatchersContaining extends FudicMatchers {}
}

/** Register the matchers. Once per environment. */
export function registerMatchers(): void {
  expect.extend({
    toReach(graph: ClientGraph, path: string) {
      const pass = reaches(graph, path);
      return {
        pass,
        message: () =>
          pass
            ? `the client graph reaches ${path}, and it should not:\n  ${graph.files.join('\n  ')}`
            : `the client graph does not reach ${path}:\n  ${graph.files.join('\n  ')}`,
      };
    },
  });
}
