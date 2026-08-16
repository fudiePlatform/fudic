/**
 * `serverValidator` — a rule that only runs with `{ server: true }`.
 *
 * It is a loose export and NOT `validator.server`, because a namespace hung off a
 * factory is exactly the shape a bundler cannot prune: reaching for `validator`
 * would drag this in for everyone.
 *
 * What lives here is only half the job. Skipping the rule on the client is the
 * model's part, and it is this mark; keeping the rule's BODY out of the client
 * bundle is the plugin's, which rewrites the argument at build time. A rule that
 * merely does not run still ships its database import.
 */

import { markServer } from '../server-flag.js';
import type { AnyForm, Validator } from '../types.js';

export const serverValidator = <T, R = AnyForm>(fn: Validator<T, R>): Validator<T, R> =>
  markServer<Validator<T, R>>((value, root) => fn(value, root));
