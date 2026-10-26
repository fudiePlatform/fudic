/**
 * `now` — the current instant, as part of fudic's portable catalog (SDD-61 §3.12).
 *
 * The view cannot write `new Date()`: no backend but Node could evaluate it with the same
 * meaning. So the instant is a catalog function, written once per runtime, and the only place
 * the view's world may call it is the whole argument of a `signal(…)` in the `@code`. The
 * server evaluates it once per render and its value travels in the signal's slot of
 * `fud-state`; a client that hydrates reads it from there and never calls this.
 *
 * In a handler it is one more function: handlers are free TS and never run on a server.
 */

/** The current instant. Part of fudic's portable catalog: each runtime implements it once. */
export function now(): Date {
  return new Date();
}
