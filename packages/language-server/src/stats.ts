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

/** Completed versus cancelled, since the server started. */
export class RequestStats {
  #completed = 0;
  #cancelled = 0;

  get completed(): number {
    return this.#completed;
  }

  get cancelled(): number {
    return this.#cancelled;
  }

  /**
   * Run `work` unless the request was already cancelled, counting either way.
   *
   * The token is asked BEFORE the work and again after: a request cancelled while it ran has
   * produced an answer nobody will read, and reporting it as completed would make the counter
   * say the opposite of what happened.
   */
  run<T>(token: CancellationToken, work: () => T, cancelled: T): T {
    if (token.isCancellationRequested) {
      this.#cancelled++;
      return cancelled;
    }

    const answer = work();
    if (token.isCancellationRequested) {
      this.#cancelled++;
      return cancelled;
    }

    this.#completed++;
    return answer;
  }

  /** Start over. Used when the server is reset; the counts are per session. */
  reset(): void {
    this.#completed = 0;
    this.#cancelled = 0;
  }
}
