/**
 * SDD-84 criterion 35: the README of `@fudic/vite` carries the backends' contract for the headers
 * and the substitution in six languages, and its Node function is the one `@fudic/server` runs.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fillPlaceholders } from '@fudic/transport';

const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

/** The code block that follows `label:` in the README. */
function blockAfter(label: string): string {
  const at = README.indexOf(`${label}:\n\n\`\`\``);
  expect(at, label).toBeGreaterThanOrEqual(0);
  const start = README.indexOf('\n', README.indexOf('```', at)) + 1;
  return README.slice(start, README.indexOf('```', start));
}

describe('the README of the headers', () => {
  it('states the contract of §4.4', () => {
    for (const line of [
      'if some value of manifest.headers.page holds "{nonce}":',
      'every "{nonce}" in those values    -> nonce',
      'every "__FUDIC_NONCE__" in the HTML -> nonce',
      'on its 103:       of those, Content-Security-Policy and Referrer-Policy, same nonce',
      'on /fudic-sw.js:  manifest.headers.sw',
      "on a static file: for each name, the most specific rule of manifest.headers.assets; '' = none",
    ]) {
      expect(README).toContain(line);
    }
  });

  it('gives the substitution in Node, Go, Java, Python, C# and Rust', () => {
    for (const label of ['Node (the one `@fudic/server` uses)', 'Go', 'Java', 'Python', 'C#', 'Rust']) {
      expect(blockAfter(label)).toContain('{nonce}');
    }
  });

  it('the Node one does what the server does', () => {
    const fill = new Function(`${blockAfter('Node (the one `@fudic/server` uses)')}\nreturn fill;`)() as (v: string, n: string) => string;
    for (const value of ["script-src 'nonce-{nonce}'", "a 'nonce-{nonce}'; b 'nonce-{nonce}'", 'no placeholder', '{nonce}{nonce}']) {
      expect(fill(value, 'abc')).toBe(fillPlaceholders(value, { nonce: 'abc' }));
    }
  });
});
