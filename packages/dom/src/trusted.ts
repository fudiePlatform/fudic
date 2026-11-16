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
interface FudicPolicy {
  createHTML(text: string): unknown;
  createScriptURL(url: string): unknown;
}

/** The part of `window.trustedTypes` this module uses: not in TypeScript's `lib.dom` yet. */
interface PolicyFactory {
  createPolicy(
    name: string,
    rules: { createHTML(text: string): string; createScriptURL(url: string): string },
  ): FudicPolicy;
}

/**
 * Where the policy lives once created: on the realm, not in this module. The always-on boot that
 * registers the Service Worker is its own bundle with its own copy of this file, and the runtime
 * piece has another; a second `createPolicy('fudic')` throws under the directive, so whichever copy
 * runs first creates it and every other one finds it here.
 */
const REALM_KEY = Symbol.for('fudic.trusted-types');

interface Realm {
  trustedTypes?: PolicyFactory;
  [REALM_KEY]?: FudicPolicy | null;
}

/** The policy of this realm, created on first use and only then; `null` without Trusted Types. */
function policyOf(): FudicPolicy | null {
  const realm = globalThis as Realm;
  if (!(REALM_KEY in realm)) {
    const factory = realm.trustedTypes;
    realm[REALM_KEY] =
      factory === undefined
        ? null
        : factory.createPolicy(POLICY_NAME, { createHTML: (text) => text, createScriptURL: (url) => url });
  }
  return realm[REALM_KEY] ?? null;
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

/**
 * `url` as `navigator.serviceWorker.register` accepts it under Trusted Types: the third door of the
 * policy, and the only script URL fudic hands the browser itself — its own worker.
 */
export function trustedScriptUrlOf(url: string): string {
  const current = policyOf();
  return current === null ? url : (current.createScriptURL(url) as string);
}
