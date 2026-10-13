/**
 * The request a piece of server code is running for (SDD-56 §4.6, step 1).
 *
 * Its container travels in an `AsyncLocalStorage` and never in a module variable, so two
 * concurrent requests keep their own across any `await`. `inject()` and `publish()` written
 * without a container read it through the hook `@fudic/di` exposes, installed here once.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { setAmbient, type Container } from '@fudic/di';

const store = new AsyncLocalStorage<Container>();
let installed = false;

/** Runs `fn` as part of the request whose root container is `container`. */
export function withRequest<T>(container: Container, fn: () => T): T {
  if (!installed) {
    setAmbient(() => store.getStore());
    installed = true;
  }
  return store.run(container, fn);
}
