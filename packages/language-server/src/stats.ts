/**
 * The instrumentation criterion §6.14 is measured with.
 *
 * "Cancellation is honoured" is not testable against a clock — a criterion measured in
 * milliseconds is not deterministic in CI — so it is measured by counting: a burst of N edits
 * followed by a pause must leave exactly one request COMPLETED per period of rest, and the N−1
 * before it CANCELLED before they typechecked anything.
 *
 * The counter is production code rather than test scaffolding because the check it wraps is
 * production behaviour: every long request asks the token before doing the work, and typing
 * fast must not queue work nobody is waiting for any more.
 */

import type { CancellationToken } from 'vscode-languageserver-protocol';

/** The kinds of work the counter attributes, one per feature the service answers. */
export type RequestKind =
  | 'codeActions'
  | 'completion'
  | 'definition'
  | 'diagnostics'
  | 'documentLinks'
  | 'formatting'
  | 'onTypeFormatting'
  | 'semanticTokens';

/** What the server did for one kind of request. */
export interface RequestCounts {
  readonly completed: number;
  readonly cancelled: number;
}

/** The answer for a kind nothing has been counted for yet. */
const NONE: RequestCounts = { completed: 0, cancelled: 0 };

/** Completed versus cancelled, since the server started. */
export class RequestStats {
  #completed = 0;
  #cancelled = 0;
  readonly #byKind = new Map<RequestKind, RequestCounts>();

  get completed(): number {
    return this.#completed;
  }

  get cancelled(): number {
    return this.#cancelled;
  }

  /**
   * The same two counts, for ONE kind of request.
   *
   * The totals cannot answer §6.14 by themselves, and that is not a detail of the test. A
   * service that declares `interFileDependencies` puts Volar in the push model too: every edit
   * schedules a validation of every open document 250 ms later, and that work completes like
   * any other. So a burst of typing raises the total by its own requests AND by whatever
   * background validation the burst provoked — a number that depends on how long the burst took,
   * which is the clock §6.14 refuses to be measured by. A claim about the requests the burst
   * made has to be counted over those requests alone.
   */
  of(kind: RequestKind): RequestCounts {
    return this.#byKind.get(kind) ?? NONE;
  }

  /**
   * Run `work` unless the request was already cancelled, counting either way.
   *
   * The token is asked BEFORE the work and again after: a request cancelled while it ran has
   * produced an answer nobody will read, and reporting it as completed would make the counter
   * say the opposite of what happened.
   */
  run<T>(kind: RequestKind, token: CancellationToken, work: () => T, cancelled: T): T {
    if (token.isCancellationRequested) return this.#count(kind, 'cancelled', cancelled);

    const answer = work();
    if (token.isCancellationRequested) return this.#count(kind, 'cancelled', cancelled);

    return this.#count(kind, 'completed', answer);
  }

  /** Start over. Used when the server is reset; the counts are per session. */
  reset(): void {
    this.#completed = 0;
    this.#cancelled = 0;
    this.#byKind.clear();
  }

  /** Add one to a total and to its kind, and hand back the answer that goes with it. */
  #count<T>(kind: RequestKind, field: keyof RequestCounts, answer: T): T {
    if (field === 'completed') this.#completed++;
    else this.#cancelled++;

    const counts = this.of(kind);
    this.#byKind.set(kind, { ...counts, [field]: counts[field] + 1 });
    return answer;
  }
}
