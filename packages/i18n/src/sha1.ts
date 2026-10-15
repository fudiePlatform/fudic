/**
 * SHA-1 of a string's UTF-8 bytes, as hex. Written here, synchronous and with no `node:crypto`,
 * because `messageKey` runs in the compiler, the plugin, the CLI and the language server alike,
 * and this package must import into any of them — and into a browser bundle that tree-shakes
 * it away — without a platform module in its graph. A key is 8 hex of it: identity, not security.
 */
export function sha1(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const length = bytes.length;
  // The message, a 1 bit, zeros, and the bit length in the last 64 bits of a 512-bit block.
  const words = new Uint32Array((((length + 8) >> 6) + 1) * 16);
  for (let i = 0; i < length; i++) words[i >> 2]! |= bytes[i]! << (24 - (i % 4) * 8);
  words[length >> 2]! |= 0x80 << (24 - (length % 4) * 8);
  words[words.length - 1] = length * 8;

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let block = 0; block < words.length; block += 16) {
    for (let t = 0; t < 16; t++) w[t] = words[block + t]!;
    for (let t = 16; t < 80; t++) w[t] = rotl(w[t - 3]! ^ w[t - 8]! ^ w[t - 14]! ^ w[t - 16]!, 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let t = 0; t < 80; t++) {
      const [f, k] =
        t < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : t < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : t < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6];
      const temp = (rotl(a, 5) + f + e + k + w[t]!) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map((h) => h.toString(16).padStart(8, '0')).join('');
}

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}
