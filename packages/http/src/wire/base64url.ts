/**
 * The arguments of a `get` in `fud-bin` travel in `?a=` as base64url (RFC 4648 §5), without `=`
 * (SDD-67 §3.2).
 */

const ALPHABET = /^[A-Za-z0-9_-]*$/u;

export function toBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

/** The bytes of `text`, or a `RangeError` when it is not base64url. */
export function fromBase64url(text: string): Uint8Array {
  let binary: string | undefined;
  try {
    binary = ALPHABET.test(text) ? atob(text.replaceAll('-', '+').replaceAll('_', '/')) : undefined;
  } catch {
    // A length no base64 has: one character left over.
  }
  if (binary === undefined) throw new RangeError('the arguments are not valid base64url');
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
