/**
 * The three `.headers` files: their syntax, the checks that need no build, and how a project's
 * files are read. SDD-84 criteria 3–13, 16, 17 and 20 (the parts that live in the reader).
 */

import { describe, expect, it } from 'vitest';
import type { FileDiagnostic } from '@fudic/diagnostics';
import {
  HEADERS_FILES,
  HEADERS_TEMPLATES,
  parseHeaders,
  readHeaders,
  type ConfigIo,
  type HeadersKind,
} from '../src/index.js';

/** `[code, the text the span covers]` of every diagnostic. */
function found(kind: HeadersKind, text: string): readonly (readonly [string, string])[] {
  return parseHeaders(kind, text).diagnostics.map((d) => [d.code, text.slice(d.span!.start, d.span!.end)] as const);
}

function codes(kind: HeadersKind, text: string): readonly string[] {
  return parseHeaders(kind, text).diagnostics.map((d) => d.code);
}

const page = (csp: string): string => `Content-Security-Policy:\n${csp
  .split('\n')
  .map((l) => `  ${l}`)
  .join('\n')}\n`;

/** A page policy with nothing to warn about, plus `extra`. */
const strict = (extra = ''): string =>
  page(`script-src 'nonce-{nonce}' 'strict-dynamic'\nobject-src 'none'\nbase-uri 'none'\nframe-ancestors 'none'${extra}`);

describe('the templates', () => {
  it('read without a single diagnostic', () => {
    for (const kind of ['page', 'sw', 'assets'] as const) expect(codes(kind, HEADERS_TEMPLATES[kind])).toEqual([]);
  });

  it('page: the CSP joins its lines with "; "', () => {
    const { entries } = parseHeaders('page', HEADERS_TEMPLATES.page);
    expect(entries.map((e) => e.name)).toEqual([
      'Content-Security-Policy',
      'Referrer-Policy',
      'Cross-Origin-Opener-Policy',
      'Strict-Transport-Security',
    ]);
    expect(entries[0]!.value).toBe(
      "default-src 'self'; script-src 'nonce-{nonce}' 'strict-dynamic' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; require-trusted-types-for 'script'; trusted-types fudic",
    );
  });

  it('assets: two rules, each with its path', () => {
    const { entries } = parseHeaders('assets', HEADERS_TEMPLATES.assets);
    expect(entries.map((r) => [r.pattern, r.headers.map((h) => `${h.name}: ${h.value}`)])).toEqual([
      ['/**', ['Cache-Control: no-cache']],
      ['/assets/**', ['Cache-Control: public, max-age=31536000, immutable']],
    ]);
  });

  it('the files are called what the SDD says', () => {
    expect(HEADERS_FILES).toEqual({ page: 'page.headers', sw: 'sw.headers', assets: 'assets.headers' });
  });
});

describe('the syntax', () => {
  it('a continuation joins with the header separator: "; " in the CSP, ", " in Cache-Control (criterion 4)', () => {
    const rules = parseHeaders('assets', '/x\n  Cache-Control:\n    public\n    max-age=60\n').entries;
    expect(rules[0]!.headers[0]!.value).toBe('public, max-age=60');
    const csp = parseHeaders('page', "Content-Security-Policy: default-src 'self'\n  img-src data:\n").entries[0]!;
    expect(csp.value).toBe("default-src 'self'; img-src data:");
    expect(csp.span).toEqual({ start: 0, end: 'Content-Security-Policy: default-src \'self\'\n  img-src data:'.length });
  });

  it('Permissions-Policy and Reporting-Endpoints continue with ", "', () => {
    const { entries, diagnostics } = parseHeaders('page', 'Permissions-Policy: camera=()\n  geolocation=(self "https://a.com")\nReporting-Endpoints: a="https://a.com/r"\n  b="https://b.com/r"\n');
    expect(diagnostics).toEqual([]);
    expect(entries.map((e) => e.value)).toEqual(['camera=(), geolocation=(self "https://a.com")', 'a="https://a.com/r", b="https://b.com/r"']);
  });

  it('a continuation of a header fudic does not know, or of one that goes on one line, is FUD1540 (criterion 4)', () => {
    expect(found('page', 'X-Custom: a\n  b\n  c\n')).toEqual([
      ['FUD1540', 'b'],
      ['FUD1540', 'c'],
    ]);
    expect(parseHeaders('page', 'X-Custom: a\n  b\n').diagnostics[0]!.message).toContain('X-Custom is not a header fudic can continue');
    expect(codes('page', 'Strict-Transport-Security: max-age=1\n  preload\n')).toEqual(['FUD1540']);
  });

  it('a header without a path in assets.headers, and a path elsewhere, are FUD1540 (criterion 5)', () => {
    expect(found('assets', 'Cache-Control: no-cache\n  public\n')).toEqual([['FUD1540', 'Cache-Control: no-cache']]);
    expect(parseHeaders('assets', 'Cache-Control: x').diagnostics[0]!.message).toContain('needs a path above it');
    expect(found('page', '/assets/**\n  Cache-Control: x\n')).toEqual([['FUD1540', '/assets/**']]);
    expect(found('sw', '/x\n')).toEqual([['FUD1540', '/x']]);
    expect(found('assets', '  Cache-Control: x\n')).toEqual([['FUD1540', 'Cache-Control: x']]);
  });

  it('a line that is not a header is FUD1540, and its indented lines are not reported again', () => {
    expect(found('page', 'nonsense\n  more\nX-A: 1\n')).toEqual([['FUD1540', 'nonsense']]);
    expect(found('page', ': no name\n')).toEqual([['FUD1540', ': no name']]);
    expect(found('page', '  orphan\n')).toEqual([['FUD1540', 'orphan']]);
    expect(found('assets', 'nonsense\n/x\n  X-A: 1\n')).toEqual([['FUD1540', 'nonsense']]);
    expect(found('assets', '/x\n  nonsense\n    more\n  X-A: 1\n')).toEqual([['FUD1540', 'nonsense']]);
    expect(parseHeaders('assets', 'nonsense').diagnostics[0]!.message).toContain('is not a header ("Name: value")');
  });

  it('comments go on their own line, also between the lines of a header', () => {
    const text = '# top\nContent-Security-Policy:\n  default-src \'self\'\n  # fud-disable-next-line FUD1547: reason\n  img-src data:\nX-Color: #fff\n';
    const { entries, comments } = parseHeaders('page', text);
    expect(entries.map((e) => e.value)).toEqual(["default-src 'self'; img-src data:", '#fff']);
    expect(comments.map((c) => c.text)).toEqual(['# top', '# fud-disable-next-line FUD1547: reason']);
    expect(text.slice(comments[1]!.span.start, comments[1]!.span.end)).toBe(comments[1]!.text);
  });

  it('CRLF line ends read as LF ones', () => {
    const { entries, diagnostics } = parseHeaders('page', 'X-A: 1\r\nCache-Control:\r\n  no-cache\r\n  private\r\n');
    expect(diagnostics).toEqual([]);
    expect(entries.map((e) => e.value)).toEqual(['1', 'no-cache, private']);
  });

  it('assets.headers: indentation decides header or continuation, block by block', () => {
    const { entries, diagnostics } = parseHeaders('assets', '/a\n    X-A: 1\n  X-B: 2\n\n/b\n  Cache-Control:\n      no-cache\n  X-A: 3\n');
    expect(diagnostics).toEqual([]);
    expect(entries.map((r) => [r.pattern, r.headers.map((h) => `${h.name}=${h.value}`)])).toEqual([
      ['/a', ['X-A=1', 'X-B=2']],
      ['/b', ['Cache-Control=no-cache', 'X-A=3']],
    ]);
    expect(entries[0]!.span).toEqual({ start: 0, end: 2 });
  });

  it('an empty block is a rule without headers', () => {
    expect(parseHeaders('assets', '/a\n/b\n  X-A: 1\n').entries.map((r) => r.headers.length)).toEqual([0, 1]);
  });
});

describe('names and repetitions (criterion 6)', () => {
  it('a header twice is FUD1541 on the second, whatever its case', () => {
    expect(found('page', 'X-A: 1\nx-a: 2\n')).toEqual([['FUD1541', 'x-a']]);
    expect(parseHeaders('page', 'X-A: 1\nx-a: 2\n').entries.map((e) => e.value)).toEqual(['1']);
  });

  it('twice in one block is FUD1541; once in each of two blocks is fine', () => {
    expect(codes('assets', '/a\n  X-A: 1\n  X-A: 2\n')).toEqual(['FUD1541']);
    expect(codes('assets', '/a\n  X-A: 1\n/b\n  X-A: 2\n')).toEqual([]);
  });

  it('X-Ñ: 1 and X-A: ñ, and a name that is not a token', () => {
    expect(found('page', 'X-Ñ: 1\n')).toEqual([['FUD1541', 'X-Ñ']]);
    expect(found('page', 'X-A: ñ\n')).toEqual([['FUD1541', 'ñ']]);
    expect(found('page', 'Cache-Control: no-cache\n  ñ\n')).toEqual([['FUD1541', 'ñ']]);
    expect(found('page', 'X A: 1\n')).toEqual([['FUD1541', 'X A']]);
    const [ascii, token] = [...parseHeaders('page', 'X-Ñ: 1\n').diagnostics, ...parseHeaders('page', 'X A: 1\n').diagnostics];
    expect(ascii!.message).toContain('outside printable ASCII');
    expect(token!.message).toContain('is not a header name');
  });

  it('names are kept as written', () => {
    expect(parseHeaders('page', 'x-CUSTOM: 1').entries[0]!.name).toBe('x-CUSTOM');
  });
});

describe("fudic's own headers (criterion 7)", () => {
  it('Content-Type in any of the three', () => {
    expect(found('page', 'Content-Type: text/html\n')).toEqual([['FUD1542', 'Content-Type']]);
    expect(codes('sw', 'Content-Type: x\n')).toEqual(['FUD1542']);
    expect(codes('assets', '/a\n  Content-Type: x\n')).toEqual(['FUD1542']);
  });

  it('Link only in page.headers; Cache-Control and Service-Worker-Allowed only in sw.headers', () => {
    expect(codes('page', 'Link: </a>; rel=preload\n')).toEqual(['FUD1542']);
    expect(codes('sw', 'Link: </a>; rel=preload\n')).toEqual([]);
    expect(codes('sw', 'Cache-Control: no-cache\nService-Worker-Allowed: /\n')).toEqual(['FUD1542', 'FUD1542']);
    expect(codes('page', 'Cache-Control: no-cache\n')).toEqual([]);
  });

  it('a block for /fudic-sw.js or the manifest', () => {
    expect(found('assets', '/fudic-sw.js\n  X-A: 1\n/fudic-routes.json\n  X-A: 1\n')).toEqual([
      ['FUD1542', '/fudic-sw.js'],
      ['FUD1542', '/fudic-routes.json'],
    ]);
    expect(codes('assets', '/fudic-*.js\n  X-A: 1\n')).toEqual([]);
  });
});

describe('values (criterion 8)', () => {
  it('COOP: a value it does not take is FUD1543 on the value; parameters are fine', () => {
    expect(found('page', 'Cross-Origin-Opener-Policy: same-site\n')).toEqual([['FUD1543', 'same-site']]);
    expect(parseHeaders('page', 'Cross-Origin-Opener-Policy: same-site').diagnostics[0]!.message).toContain('expected same-origin, same-origin-allow-popups');
    expect(codes('page', 'Cross-Origin-Opener-Policy: same-origin; report-to="coop"\n')).toEqual([]);
  });

  it('Cache-Control: known directives, numbers where they go', () => {
    expect(found('assets', '/a\n  Cache-Control: max-age=mucho\n')).toEqual([['FUD1543', 'max-age=mucho']]);
    expect(codes('assets', '/a\n  Cache-Control: no-cache="Set-Cookie", private, s-maxage="10", stale-if-error=5\n')).toEqual([]);
    const bad = parseHeaders('assets', '/a\n  Cache-Control: max-age, public=1, no-cache=x, forever\n').entries;
    expect(bad[0]!.headers).toHaveLength(1);
    const messages = parseHeaders('assets', '/a\n  Cache-Control: max-age, public=1, no-cache=x, forever\n').diagnostics.map((d) => d.message);
    expect(messages).toEqual([
      'Cache-Control does not accept "max-age": expected max-age=<seconds>',
      'Cache-Control does not accept "public=1": expected public without a value',
      'Cache-Control does not accept "no-cache=x": expected no-cache, or no-cache="<header names>"',
      expect.stringContaining('Cache-Control does not accept "forever": expected a response directive: max-age, s-maxage'),
    ]);
  });

  it('an empty value is FUD1543 in page.headers and sw.headers, and "do not send" in assets.headers', () => {
    expect(found('page', 'X-A:\n')).toEqual([['FUD1543', 'X-A']]);
    expect(parseHeaders('page', 'X-A:   \n').entries).toEqual([]);
    expect(codes('sw', 'X-A:\n')).toEqual(['FUD1543']);
    const rule = parseHeaders('assets', '/legacy.js\n  Cache-Control:\n');
    expect(rule.diagnostics).toEqual([]);
    expect(rule.entries[0]!.headers[0]!.value).toBe('');
  });

  it('Permissions-Policy: a member that is not one', () => {
    expect(found('page', 'Permissions-Policy: camera=(), geolocation=(self\n')).toEqual([['FUD1543', 'geolocation=(self']]);
    expect(codes('page', 'Permissions-Policy: fullscreen=*, usb=(), interest-cohort=();report-to=a\n')).toEqual([]);
  });

  it('a header fudic does not know: only its name is checked', () => {
    expect(codes('page', 'X-Anything: whatever, goes; here\n')).toEqual([]);
  });
});

describe('the CSP', () => {
  it('an empty directive, like a trailing ";", is nothing', () => {
    expect(found('page', strict(";\nimg-src 'self';;"))).toEqual([]);
  });

  it('a directive that does not exist is FUD1544 (criterion 9)', () => {
    expect(found('page', strict("\nscript-srcc 'self'"))).toEqual([['FUD1544', 'script-srcc']]);
  });

  it('each source with its form', () => {
    const ok = "\nimg-src * data: https://cdn.example.com:443/img/ *.example.com 'sha256-abc+/=' https://x:*\nconnect-src 'self'";
    expect(codes('page', strict(ok))).toEqual([]);
    expect(found('page', strict("\nimg-src 'bogus' 'self'"))).toEqual([['FUD1543', "'bogus'"]]);
    expect(found('page', strict("\nimg-src 'none' 'self'"))).toEqual([['FUD1543', "'none'"]]);
    expect(parseHeaders('page', strict("\nimg-src 'none' 'self'")).diagnostics[0]!.message).toContain("'none' alone");
    expect(found('page', strict('\nimg-src exa_mple')).map(([c]) => c)).toEqual(['FUD1543']);
  });

  it('the directives whose words are not sources', () => {
    const fine = "\nrequire-trusted-types-for 'script'\ntrusted-types fudic other 'allow-duplicates'\nsandbox allow-scripts\nupgrade-insecure-requests\nwebrtc 'block'\nreport-uri /csp anything\nreport-to csp";
    expect(codes('page', strict(fine))).toEqual([]);
    expect(found('page', strict("\nrequire-trusted-types-for 'style'"))).toEqual([['FUD1543', "'style'"]]);
    expect(found('page', strict("\ntrusted-types 'bad'"))).toEqual([['FUD1543', "'bad'"]]);
    expect(found('page', strict('\nsandbox scripts'))).toEqual([['FUD1543', 'scripts']]);
    expect(found('page', strict('\nupgrade-insecure-requests now'))).toEqual([['FUD1543', 'now']]);
    expect(found('page', strict('\nwebrtc allow'))).toEqual([['FUD1543', 'allow']]);
  });

  it('a nonce by hand, a placeholder that is not one, or {nonce} out of place are FUD1546 (criterion 11)', () => {
    expect(found('page', strict("\nstyle-src 'nonce-abc123'"))).toEqual([['FUD1546', "'nonce-abc123'"]]);
    expect(found('page', strict('\nimg-src https://{nonce}.x'))).toEqual([['FUD1546', 'https://{nonce}.x']]);
    expect(found('page', strict('\nimg-src {otro}'))).toEqual([['FUD1546', '{otro}']]);
    expect(parseHeaders('page', strict('\nimg-src {otro}')).diagnostics[0]!.message).toContain('{otro} is not a placeholder');
    expect(found('sw', "Content-Security-Policy: script-src 'nonce-{nonce}'\n")).toEqual([['FUD1546', "'nonce-{nonce}'"]]);
    expect(found('page', strict("\ntrusted-types 'nonce-{nonce}'"))).toEqual([['FUD1546', "'nonce-{nonce}'"]]);
    expect(codes('page', strict("\nstyle-src 'nonce-{nonce}'"))).toEqual([]);
  });

  it('{…} outside the CSP: never filled there', () => {
    expect(found('page', 'X-A: a{nonce}b\n')).toEqual([['FUD1546', '{nonce}']]);
    expect(parseHeaders('page', 'X-A: {nonce}').diagnostics[0]!.message).toContain("goes only inside 'nonce-{nonce}'");
    expect(parseHeaders('sw', 'X-A: {nonce}').diagnostics[0]!.message).toContain('is filled only in page.headers');
    expect(found('assets', '/a\n  X-A: {x} {nonce}\n')).toEqual([
      ['FUD1546', '{x}'],
      ['FUD1546', '{nonce}'],
    ]);
    expect(codes('page', 'Cross-Origin-Opener-Policy: {nonce}\n')).toEqual(['FUD1546']);
  });
});

describe('what weakens the page policy (criterion 12)', () => {
  it("a scheme without 'strict-dynamic' is FUD1547; behind it, not", () => {
    expect(found('page', page("script-src 'nonce-{nonce}' https:\nobject-src 'none'\nbase-uri 'none'\nframe-ancestors 'none'"))).toEqual([
      ['FUD1547', 'https:'],
    ]);
    expect(codes('page', strict().replace("'strict-dynamic'", "'strict-dynamic' https: * cdn.x.com"))).toEqual([]);
  });

  it("'unsafe-eval' always, and 'unsafe-inline' without a nonce or a hash", () => {
    expect(found('page', strict().replace("'strict-dynamic'", "'strict-dynamic' 'unsafe-eval'"))).toEqual([['FUD1547', "'unsafe-eval'"]]);
    const inline = page("script-src 'self' 'unsafe-inline'\nobject-src 'none'\nbase-uri 'none'\nframe-ancestors 'none'");
    expect(found('page', inline)).toEqual([['FUD1547', "'unsafe-inline'"]]);
    expect(codes('page', inline.replace("'self'", "'sha256-abc='"))).toEqual([]);
  });

  it('the script policy falls back to default-src', () => {
    expect(found('page', page("default-src * \nobject-src 'none'\nbase-uri 'none'\nframe-ancestors 'none'"))).toEqual([['FUD1547', '*']]);
    expect(codes('page', page("img-src 'self'\nobject-src 'none'\nbase-uri 'none'\nframe-ancestors 'none'"))).toEqual([]);
  });

  it("object-src: missing, or anything but 'none'; default-src 'none' covers it", () => {
    const rest = "script-src 'nonce-{nonce}' 'strict-dynamic'\nbase-uri 'none'\nframe-ancestors 'none'";
    expect(found('page', page(rest))).toEqual([['FUD1547', 'Content-Security-Policy']]);
    expect(parseHeaders('page', page(rest)).diagnostics[0]!.message).toBe('the policy has no object-src: without it, what it guards is open');
    expect(found('page', page(`${rest}\nobject-src 'none' 'self'`)).map(([c, t]) => `${c} ${t}`)).toEqual(["FUD1543 'none'", "FUD1547 'self'"]);
    expect(codes('page', page(`${rest}\ndefault-src 'none'`))).toEqual([]);
    expect(codes('page', page(`${rest}\nobject-src`))).toEqual([]);
  });

  it('without base-uri or frame-ancestors', () => {
    expect(found('page', page("script-src 'nonce-{nonce}' 'strict-dynamic'\nobject-src 'none'")).map(([c]) => c)).toEqual(['FUD1547', 'FUD1547']);
    expect(parseHeaders('page', page("script-src 'nonce-{nonce}' 'strict-dynamic'\nobject-src 'none'\nbase-uri 'none'")).diagnostics.map((d) => d.message)).toEqual([
      'the policy has no frame-ancestors: without it, what it guards is open',
    ]);
  });

  it('only in page.headers', () => {
    expect(codes('sw', "Content-Security-Policy: script-src 'self' 'unsafe-eval'\n")).toEqual([]);
  });
});

describe('Referrer-Policy and HSTS (criteria 16 and 17)', () => {
  it('no-referrer is FUD1549; the last of a list is the one that counts', () => {
    expect(found('page', 'Referrer-Policy: no-referrer\n')).toEqual([['FUD1549', 'no-referrer']]);
    expect(codes('page', 'Referrer-Policy: no-referrer, strict-origin-when-cross-origin\n')).toEqual([]);
    expect(codes('page', 'Referrer-Policy: same-origin, origin\n')).toEqual(['FUD1549']);
    expect(found('page', 'Referrer-Policy: nope, origin\n')).toEqual([['FUD1543', 'nope']]);
  });

  it('max-age=86400; preload is FUD1550, twice: too short and without includeSubDomains', () => {
    const d = parseHeaders('page', 'Strict-Transport-Security: max-age=86400; preload\n').diagnostics;
    expect(d.map((x) => x.code)).toEqual(['FUD1550', 'FUD1550']);
    expect(d.map((x) => x.message)).toEqual([
      expect.stringContaining('at least 31536000'),
      expect.stringContaining('preload needs includeSubDomains'),
    ]);
  });

  it('max-age is required; quoted is fine; an unknown directive is FUD1543', () => {
    expect(codes('page', 'Strict-Transport-Security: max-age="31536000"; includeSubDomains; preload\n')).toEqual([]);
    expect(found('page', 'Strict-Transport-Security: includeSubDomains\n')).toEqual([['FUD1543', 'Strict-Transport-Security']]);
    expect(found('page', 'Strict-Transport-Security: max-age=1; forever\n')).toEqual([['FUD1543', 'forever']]);
    expect(codes('page', 'Strict-Transport-Security: preload; includeSubDomains\n')).toEqual(['FUD1543']);
  });
});

/** A filesystem in memory: `files` by path; `throws` for the paths whose read fails. */
function memory(files: Record<string, string>, throws: Record<string, unknown> = {}): ConfigIo {
  return {
    exists: (path) => path in files || path in throws,
    read: (path) => {
      if (path in throws) throw throws[path];
      return files[path]!;
    },
  };
}

describe('readHeaders', () => {
  const app = { kind: 'app', sw: true } as const;

  it('an app without any file serves the templates (criterion 3)', () => {
    const read = readHeaders('/p', memory({}), app);
    expect(read.diagnostics).toEqual([]);
    expect(read.sources).toEqual({});
    expect(read.config).toEqual({
      page: parseHeaders('page', HEADERS_TEMPLATES.page).entries,
      sw: parseHeaders('sw', HEADERS_TEMPLATES.sw).entries,
      assets: parseHeaders('assets', HEADERS_TEMPLATES.assets).entries,
    });
  });

  it('a file that is there is read as it is, errors included, and gives its text and comments', () => {
    const text = '# mine\nX-A: 1\nnonsense\n';
    const read = readHeaders('/p', memory({ '/p/page.headers': text }), app);
    expect(read.config.page.map((e) => e.name)).toEqual(['X-A']);
    expect(read.diagnostics.map((d) => [d.code, d.file])).toEqual([['FUD1540', 'page.headers']]);
    expect(read.sources.page).toEqual({ text, comments: [{ span: { start: 0, end: 6 }, text: '# mine' }] });
    expect(read.config.sw).toEqual(parseHeaders('sw', HEADERS_TEMPLATES.sw).entries);
  });

  it('in a library each file is FUD1554, and nothing applies (criterion 20)', () => {
    const read = readHeaders('/p', memory({ '/p/page.headers': 'X-A: 1', '/p/assets.headers': '/a' }), { kind: 'lib', sw: false });
    expect(read.diagnostics).toEqual<FileDiagnostic[]>([
      expect.objectContaining({ code: 'FUD1554', file: 'page.headers', message: 'a library is not served: its headers apply to nothing' }),
      expect.objectContaining({ code: 'FUD1554', file: 'assets.headers' }),
    ]);
    expect(read.config).toEqual({ page: [], sw: [], assets: [] });
  });

  it('sw.headers in an app without sw.json is FUD1554; without the file, nothing (criterion 20)', () => {
    const noSw = { kind: 'app', sw: false } as const;
    const read = readHeaders('/p', memory({ '/p/sw.headers': 'X-A: 1' }), noSw);
    expect(read.diagnostics.map((d) => [d.code, d.file, d.message])).toEqual([
      ['FUD1554', 'sw.headers', 'the app has no sw.json, so no Service Worker: sw.headers applies to nothing'],
    ]);
    expect(read.config.sw).toEqual([]);
    expect(readHeaders('/p', memory({}), noSw).diagnostics).toEqual([]);
  });

  it('a file that cannot be read is FUD1540, and does not fall back to the template', () => {
    const read = readHeaders('/p', memory({}, { '/p/page.headers': new Error('EACCES'), '/p/assets.headers': 'odd' }), app);
    expect(read.diagnostics.map((d) => d.message)).toEqual(['page.headers could not be read: EACCES', 'assets.headers could not be read: odd']);
    expect(read.config.page).toEqual([]);
    expect(read.config.assets).toEqual([]);
  });
});
