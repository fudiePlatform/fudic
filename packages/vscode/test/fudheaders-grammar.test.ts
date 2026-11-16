/**
 * The `.headers` TextMate grammar (SDD-84 §3.8): comments, names, paths, CSP directives, keywords
 * between quotes and `{nonce}`, each asserted by name so that nothing changes colour quietly.
 */

import { describe, expect, it } from 'vitest';
import { findExact, tokenize, type Token } from './_tokenize.js';

const BASE = 'source.fudheaders';

const headers = (source: string): Promise<Token[]> => tokenize(source, BASE);

/** The innermost scope of the token exactly `text` on `line`. */
const scopeAt = (tokens: readonly Token[], line: number, text: string): string | undefined =>
  findExact(
    tokens.filter((t) => t.line === line),
    text,
  ).scopes.at(-1);

const PAGE = [
  '# The headers of every page.',
  'Content-Security-Policy:',
  "  script-src 'nonce-{nonce}' 'strict-dynamic' https:",
  '  # fud-disable-next-line FUD1547: the video CDN',
  '  object-src',
  'Strict-Transport-Security: max-age=63072000; includeSubDomains',
  'X-Custom: anything, else',
].join('\n');

const ASSETS = ['/assets/**', '  Cache-Control: public, max-age=31536000, immutable'].join('\n');

describe('a page.headers', () => {
  it('paints the comments, alone on their line, indented or not', async () => {
    const tokens = await headers(PAGE);
    expect(scopeAt(tokens, 0, '#')).toBe('punctuation.definition.comment.fudheaders');
    expect(scopeAt(tokens, 0, ' The headers of every page.')).toBe('comment.line.number-sign.fudheaders');
    expect(scopeAt(tokens, 3, ' fud-disable-next-line FUD1547: the video CDN')).toBe('comment.line.number-sign.fudheaders');
  });

  it('paints a name and its colon, known or not', async () => {
    const tokens = await headers(PAGE);
    expect(scopeAt(tokens, 1, 'Content-Security-Policy')).toBe('entity.name.tag.header.fudheaders');
    expect(scopeAt(tokens, 1, ':')).toBe('punctuation.separator.key-value.fudheaders');
    expect(scopeAt(tokens, 6, 'X-Custom')).toBe('entity.name.tag.header.fudheaders');
  });

  it('paints the directives, the quoted keywords and the placeholder inside one', async () => {
    const tokens = await headers(PAGE);
    expect(scopeAt(tokens, 2, 'script-src')).toBe('keyword.other.directive.csp.fudheaders');
    expect(scopeAt(tokens, 4, 'object-src')).toBe('keyword.other.directive.csp.fudheaders');
    expect(scopeAt(tokens, 2, '{nonce}')).toBe('variable.other.placeholder.fudheaders');
    expect(scopeAt(tokens, 2, 'nonce-')).toBe('string.quoted.single.fudheaders');
    expect(scopeAt(tokens, 2, 'strict-dynamic')).toBe('string.quoted.single.fudheaders');
    // A continuation is no header: `https:` is a source, not a name.
    expect(tokens.filter((t) => t.line === 2).some((t) => t.scopes.includes('entity.name.tag.header.fudheaders'))).toBe(false);
  });

  it('paints the numbers and the separators of a value', async () => {
    const tokens = await headers(PAGE);
    expect(scopeAt(tokens, 5, '63072000')).toBe('constant.numeric.fudheaders');
    expect(scopeAt(tokens, 5, ';')).toBe('punctuation.separator.fudheaders');
    expect(scopeAt(tokens, 6, ',')).toBe('punctuation.separator.fudheaders');
  });

  it('a quote left open ends with its line', async () => {
    const tokens = await headers("Content-Security-Policy: script-src 'self\nX-A: 1");
    expect(scopeAt(tokens, 1, 'X-A')).toBe('entity.name.tag.header.fudheaders');
  });
});

describe('an assets.headers', () => {
  it('paints the path of a block, and its indented headers as names', async () => {
    const tokens = await headers(ASSETS);
    expect(scopeAt(tokens, 0, '/assets/**')).toBe('entity.name.section.path.fudheaders');
    expect(scopeAt(tokens, 1, 'Cache-Control')).toBe('entity.name.tag.header.fudheaders');
    expect(scopeAt(tokens, 1, '31536000')).toBe('constant.numeric.fudheaders');
  });
});
