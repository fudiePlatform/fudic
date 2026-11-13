/**
 * The one Trusted Types policy of fudic (SDD-84 §4.6): `fudic`.
 *
 * Under `require-trusted-types-for 'script'` a browser refuses a plain string in `innerHTML`, and
 * the runtime has exactly two places that write HTML: the markup an author hands `@raw` (through
 * `htmlOf`, already escaped unless the value was marked with `trustedHtml`) and the summary of a
 * form, which fudic composes escaping every message. Both go through `trustedHtmlOf`, so the page
 * has two doors for HTML and both carry the policy's name.
 *
 * **The policy does not sanitize.** `createHTML` returns the text as it is: deciding what HTML is
 * safe is the author's, and what the policy adds is that there is no third door.
 *
 * **A module with state, and so a frontier of the pieces** (SDD-45), like `core/owner` and
 * `di/ambient`: a second `createPolicy('fudic')` throws when the directive is active, so whoever
 * paints HTML imports this module and never a copy of it.
 *
 * Without `trustedTypes` in the browser the text is returned and the runtime assigns a string, as
 * it always did.
 */

/** The name of the policy, as `trusted-types` has to list it. */
export const POLICY_NAME = 'fudic';

/**
 * What this policy needs from the page's CSP (SDD-84 §3.4), declared beside the policy: its name in
 * `trusted-types`, when the page has `require-trusted-types-for`. The compiler registers it where it
 * writes code that paints HTML; the day nothing does, `fudic` in `trusted-types` becomes `FUD1556`.
 * Structurally a `CspNeed` of `@fudic/config`.
 */
export const TRUSTED_TYPES_NEEDS: readonly {
  readonly loads: 'policy';
  readonly policy: string;
  readonly piece: string;
}[] = [{ loads: 'policy', policy: POLICY_NAME, piece: 'the Trusted Types policy of fudic' }];

/** The part of a Trusted Types policy this module uses. */
interface HtmlPolicy {
  createHTML(text: string): unknown;
}

/** The part of `window.trustedTypes` this module uses: not in TypeScript's `lib.dom` yet. */
interface PolicyFactory {
  createPolicy(name: string, rules: { createHTML(text: string): string }): HtmlPolicy;
}

/** The policy, once created; `null` where the browser has no Trusted Types. */
let policy: HtmlPolicy | null | undefined;

/** The policy of this realm, created on first use and only then. */
function policyOf(): HtmlPolicy | null {
  if (policy === undefined) {
    const factory = (globalThis as { trustedTypes?: PolicyFactory }).trustedTypes;
    policy = factory === undefined ? null : factory.createPolicy(POLICY_NAME, { createHTML: (text) => text });
  }
  return policy;
}

/**
 * `html` as `innerHTML` accepts it under Trusted Types: a `TrustedHTML` made by the `fudic` policy,
 * or the string itself where the browser has none. Typed as `string` because that is what the
 * declaration of `innerHTML` in `lib.dom` accepts; the browser takes either.
 */
export function trustedHtmlOf(html: string): string {
  const current = policyOf();
  return current === null ? html : (current.createHTML(html) as string);
}
