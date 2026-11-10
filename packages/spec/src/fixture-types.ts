/**
 * The values a page's or a flow's fixture holds. They are the contract's — the `.d.ts` of a
 * route types its fixture with them, and the server reads them — so they live in
 * `@fudic/http/contract` and a fixture reaches them here, beside the helpers that make them.
 */

import type { Answer, FileAnswer, Later, ServiceOverride } from '@fudic/http/contract';

export type {
  Answer,
  Failed,
  FailedCode,
  FailedStatus,
  FileAnswer,
  FixtureOf,
  Later,
  Redirected,
  ServiceOverride,
} from '@fudic/http/contract';

/** The fixture of a flow: the services of each criterion, and the answers it fakes. */
export interface FlowFixtures {
  /** The services each criterion puts in place of the real ones, by name. Each `use` runs once per criterion. */
  readonly services?: Readonly<Record<string, readonly ServiceOverride[]>>;
  /** What each function or remote rule answers, by name of the group. A function that is not here runs for real. */
  readonly calls?: Readonly<Record<string, Readonly<Record<string, Answer<unknown, string> | FileAnswer | Later<FileAnswer>>>>>;
}
