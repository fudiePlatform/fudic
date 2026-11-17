/**
 * The escaping of HTML: the one the server serializes with and the compiler writes templates
 * with, so the two can never escape differently.
 */

import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeText } from '../src/escape.js';
import * as api from '../src/index.js';

describe('escapeText', () => {
  it('escapes `& < >` and leaves quotes alone', () => {
    expect(escapeText('a & <b> "c"')).toBe('a &amp; &lt;b&gt; "c"');
  });
});

describe('escapeAttr', () => {
  it('escapes `& "` and leaves angle brackets alone', () => {
    expect(escapeAttr('a & "b" <c>')).toBe('a &amp; &quot;b&quot; <c>');
  });

  it('both are exported from the package entry', () => {
    expect(api.escapeText).toBe(escapeText);
    expect(api.escapeAttr).toBe(escapeAttr);
  });
});
