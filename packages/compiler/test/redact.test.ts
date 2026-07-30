/**
 * BUG-09 §4.3: the source view a map may embed.
 *
 * The property that matters is not «the server code is gone» — that one is easy — but that
 * removing it moved NOTHING. A map's `mappings` are offsets into this text, so the redacted
 * source has to measure exactly what the original measured, line for line and column for
 * column. Every test here is really about that.
 */

import { describe, it, expect } from 'vitest';
import { parseCodeBlock, redactServerRegions } from '../src/code/index.js';
import { Lexer } from '../src/lexer/index.js';
import { type HtmlParseContext } from '../src/html/index.js';
import { ok, span } from '../src/types/index.js';

/** Parse a `@code` block and redact its source, driven as SDD-05 drives it. */
function redact(source: string): string {
  const at = source.indexOf('@code');
  const keywordSpan = span(at + 1, at + 5);
  const lexer = new Lexer(source);
  lexer.seekTo(keywordSpan.end);
  const ctx: HtmlParseContext = { source, lexer, parseContentUntil: () => ok([]) };
  return redactServerRegions(source, parseCodeBlock(ctx, keywordSpan).value);
}

const WITH_SERVER = `@code {
  type PageData = { title: string };

  @server {
    import { db } from './db';
    export async function load() {
      return db.query('SELECT token FROM secrets');
    }
  }
}
`;

describe('redactServerRegions', () => {
  it('blanks the server body and keeps everything else verbatim', () => {
    const out = redact(WITH_SERVER);
    expect(out).not.toContain('db.query');
    expect(out).not.toContain("from './db'");
    // The neutral JS is not server code: it types the page and it is what one debugs.
    expect(out).toContain('type PageData = { title: string }');
    // A redaction should read as one: the marker stays.
    expect(out).toContain('@server {');
  });

  it('measures exactly what the original measured', () => {
    const out = redact(WITH_SERVER);
    expect(out).toHaveLength(WITH_SERVER.length);
    expect(out.split('\n')).toHaveLength(WITH_SERVER.split('\n').length);
    // Column for column: every line keeps its width, or a mapping would land elsewhere.
    const before = WITH_SERVER.split('\n').map((l) => l.length);
    expect(out.split('\n').map((l) => l.length)).toEqual(before);
  });

  it('blanks every region, not just the first', () => {
    const two = `@code {
  @server { const a = 'one'; }
  const neutral = 1;
  @server { const b = 'two'; }
}
`;
    const out = redact(two);
    expect(out).not.toContain("'one'");
    expect(out).not.toContain("'two'");
    expect(out).toContain('const neutral = 1;');
    expect(out).toHaveLength(two.length);
  });

  it('returns a source with no `@code` untouched', () => {
    const plain = '<h1>hello</h1>\n';
    expect(redactServerRegions(plain, undefined)).toBe(plain);
  });

  it('returns a `@code` with no `@server` untouched', () => {
    const clientOnly = `@code {
  const count = { value: 0 };
  @client { count.value += 1; }
}
`;
    // `@client` is code that runs in the browser: hiding it would hide what is debugged.
    expect(redact(clientOnly)).toBe(clientOnly);
  });
});
