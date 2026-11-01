/**
 * The current instant. A view cannot write `new Date()`, because only Node could evaluate it
 * on the server; it calls this instead, as the whole argument of a `signal(…)`. The server
 * evaluates it once per render and a hydrating client reads the value from the page.
 */
export function now(): Date {
  return new Date();
}
