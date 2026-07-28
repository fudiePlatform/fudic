/**
 * Content Security Policy with a per-response nonce (SDD-20 §4.9).
 *
 * Three independent realms: the document (`script-src 'self' 'nonce-…'`), the Service
 * Worker script (`'unsafe-eval'`, because the linker is a `new Function`) and nothing
 * else. A Service Worker does NOT inherit the document's policy, which is precisely
 * what makes it possible to keep documents strict while `/fudic-sw.js` may evaluate.
 *
 * The policy travels in the manifest so server and SW cannot diverge, and it is
 * applied by BOTH: a page the SW builds without it would ship with no policy at all
 * even when the server sets one.
 *
 * Prerendered HTML carries the literal `__FUDIC_NONCE__`, replaced by whoever serves
 * it. A nonce baked at build time is a constant, and a constant nonce is not a nonce.
 */

export const NONCE_TOKEN = '__FUDIC_NONCE__';

/** Default policies. `style-src` keeps `'unsafe-inline'`: see SDD-20 §4.9.4. */
export const DEFAULT_CSP = {
  document:
    "default-src 'self'; script-src 'self' 'nonce-{nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'",
  sw: "default-src 'self'; script-src 'self' 'unsafe-eval'",
} as const;

/** 128 bits, base64url. Unpredictable and per response — anything else is theatre. */
export function newNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

/** Fill the `{nonce}` token of a policy template. */
export function cspFor(template: string, nonce: string): string {
  return template.split('{nonce}').join(nonce);
}

/** Replace the build-time nonce token in a rendered document. */
export function applyNonce(html: string, nonce: string): string {
  return html.split(NONCE_TOKEN).join(nonce);
}
