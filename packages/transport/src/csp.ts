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

/**
 * `applyNonce` over a stream, so the render never has to be buffered to get its nonce.
 *
 * The Service Worker renders with the TOKEN rather than a literal nonce, because the
 * same bytes may be persisted and served again later, and a reused nonce is not a nonce
 * (BUG-02 §4.5). The token can straddle a chunk boundary, so the last
 * `NONCE_TOKEN.length - 1` characters are held back until the next chunk completes them;
 * re-running the substitution over that carry is harmless, as a nonce never contains
 * the token.
 */
export function applyNonceStream(
  source: ReadableStream<Uint8Array>,
  nonce: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const hold = NONCE_TOKEN.length - 1;
  let carry = '';
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller): void {
        const text = applyNonce(carry + decoder.decode(chunk, { stream: true }), nonce);
        const keep = Math.max(0, text.length - hold);
        carry = text.slice(keep);
        if (keep > 0) {
          controller.enqueue(encoder.encode(text.slice(0, keep)));
        }
      },
      flush(controller): void {
        const text = applyNonce(carry + decoder.decode(), nonce);
        if (text.length > 0) {
          controller.enqueue(encoder.encode(text));
        }
      },
    }),
  );
}
