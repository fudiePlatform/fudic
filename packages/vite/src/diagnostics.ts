/**
 * What is left of the build's own diagnostics module once every code moved to
 * `@fudic/diagnostics` (SDD-50): the policy check `FUD0803` is decided by.
 */

/**
 * Whether a document policy leaves room for the inline form: does it declare the nonce?
 *
 * The token and not a parsed policy, because the token is what the response substitutes
 * (`cspFor`): a policy that never writes `{nonce}` cannot produce a nonce for the page, and
 * no amount of reading `script-src` changes that.
 */
export function policyDeclaresNonce(documentPolicy: string): boolean {
  return documentPolicy.includes('{nonce}');
}
