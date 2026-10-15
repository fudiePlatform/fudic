import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha1 } from '../src/sha1.js';

const node = (text: string): string => createHash('sha1').update(text, 'utf8').digest('hex');

describe('sha1', () => {
  it.each([
    ['the empty string', ''],
    ['"abc"', 'abc'],
    ['55 bytes: the padding still fits in one block', 'a'.repeat(55)],
    ['56 bytes: the length spills into a second block', 'a'.repeat(56)],
    ['63 bytes', 'a'.repeat(63)],
    ['64 bytes: exactly one block', 'a'.repeat(64)],
    ['119 bytes', 'b'.repeat(119)],
    ['several blocks', 'The quick brown fox jumps over the lazy dog. '.repeat(40)],
    ['non-ASCII: two, three and four UTF-8 bytes', 'ñ€😀'],
    ['a NUL inside', 'app-card\0Cerrar'],
  ])('matches node:crypto on %s', (_case, text) => {
    expect(sha1(text)).toBe(node(text));
  });

  it('knows the test vector of FIPS 180', () => {
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
});
