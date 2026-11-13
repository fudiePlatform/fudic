/**
 * The per-response nonce (SDD-20 §4.9).
 *
 * The policies themselves are the app's: `page.headers` and `sw.headers` (SDD-84), carried
 * by the manifest so server and SW cannot diverge. What lives here is the nonce: a new one
 * for each response, and only when `page.headers` asks for one (`wantsNonce`).
 *
 * Prerendered HTML carries the literal `__FUDIC_NONCE__`, replaced by whoever serves
 * it. A nonce baked at build time is a constant, and a constant nonce is not a nonce.
 */

export const NONCE_TOKEN = '__FUDIC_NONCE__';

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


/** Replace the build-time nonce token in a rendered document. */
export function applyNonce(html: string, nonce: string): string {
  return html.split(NONCE_TOKEN).join(nonce);
}

/** How many characters at the end of `text` could be the start of a token the next chunk ends. */
function partialToken(text: string): number {
  for (let n = Math.min(NONCE_TOKEN.length - 1, text.length); n > 0; n -= 1) {
    if (NONCE_TOKEN.startsWith(text.slice(-n))) return n;
  }
  return 0;
}

/**
 * `applyNonce` over a stream, so the render never has to be buffered to get its nonce.
 *
 * The Service Worker renders with the TOKEN rather than a literal nonce, because the
 * same bytes may be persisted and served again later, and a reused nonce is not a nonce
 * (BUG-02 §4.5). The token can straddle a chunk boundary, so the end of a chunk that could be
 * the start of one is held back until the next chunk completes it — and only that: a page in
 * parts (SDD-70 §3.5) ends each part with its marker, and holding the marker back until the
 * next part would keep the browser from reading the part it closes;
 * re-running the substitution over that carry is harmless, as a nonce never contains
 * the token.
 */
export function applyNonceStream(
  source: ReadableStream<Uint8Array>,
  nonce: string,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let carry = '';
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller): void {
        const text = applyNonce(carry + decoder.decode(chunk, { stream: true }), nonce);
        const keep = text.length - partialToken(text);
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
