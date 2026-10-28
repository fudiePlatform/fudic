/**
 * The signature of a function (SDD-67 §3.3): FNV-1a of 32 bits over the UTF-8 bytes of its
 * canonical text, as 8 lowercase hexadecimal digits. The compiler computes it; it is exported so
 * a test, or a backend in another language, can compute it again.
 */

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

export function signature(canonical: string): string {
  let hash = OFFSET;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash = Math.imul(hash ^ byte, PRIME) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
