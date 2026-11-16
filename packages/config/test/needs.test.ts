/**
 * What fudic's output needs against what a policy lets in, with needs made up for the test: the
 * config part of SDD-84 criteria 10, 13 and 14. Tomorrow without touching code: a piece that stops
 * needing something turns what the policy kept for it into FUD1556.
 */

import { describe, expect, it } from 'vitest';
import {
  CACHE_CONTROL_DIRECTIVES,
  checkNeeds,
  CSP_NEEDS_FILE,
  cspOf as cspAmong,
  HEADERS_TEMPLATES,
  nameSpanOf,
  parseCsp,
  parseHeaders,
  readCspNeeds,
  segmentsOf,
  SOURCE_LIST_DIRECTIVES,
  type CspNeed,
  type CspPolicy,
} from '../src/index.js';

function cspOf(kind: 'page' | 'sw', text: string): CspPolicy {
  const entry = parseHeaders(kind, text).entries.find((e) => e.name === 'Content-Security-Policy')!;
  return parseCsp({ segments: segmentsOf(text, entry), nameSpan: nameSpanOf(entry) });
}

const polyfill: CspNeed = { loads: 'inline-script', piece: 'the style polyfill' };
const main: CspNeed = { loads: 'script', piece: 'the runtime script' };
const style: CspNeed = { loads: 'inline-style', piece: 'the component styles' };
const policy: CspNeed = { loads: 'policy', policy: 'fudic', piece: 'the Trusted Types policy' };
const linker: CspNeed = { loads: 'eval', piece: 'the route linker' };

/** `[code, action, directive, source, text at the span]`. */
function findings(kind: 'page' | 'sw', text: string, needs: readonly CspNeed[]): readonly string[] {
  return checkNeeds(kind, cspOf(kind, text), needs, `${kind}.headers`).map(
    (f) => `${f.diagnostic.code} ${f.action} ${f.directive} ${f.source} @${text.slice(f.span.start, f.span.end)}`,
  );
}

const csp = (body: string): string => `Content-Security-Policy: ${body}\n`;

describe('the templates', () => {
  it('let in everything a hydrating page and the Service Worker emit, and keep nothing extra', () => {
    expect(findings('page', HEADERS_TEMPLATES.page, [polyfill, main, style, policy])).toEqual([]);
    expect(findings('sw', HEADERS_TEMPLATES.sw, [linker])).toEqual([]);
  });

  it('a file without a CSP: nothing blocked, nothing kept', () => {
    expect(checkNeeds('page', undefined, [polyfill], 'page.headers')).toEqual([]);
  });
});

describe('FUD1545: the page policy blocks what fudic emits (criterion 10)', () => {
  it("the polyfill inline against script-src 'self': add the nonce, on the directive", () => {
    const [finding] = checkNeeds('page', cspOf('page', csp("script-src 'self'")), [polyfill], 'page.headers');
    expect(finding!.diagnostic).toMatchObject({ code: 'FUD1545', severity: 'error', file: 'page.headers' });
    expect(finding!.diagnostic.message).toBe("script-src blocks the style polyfill: it needs 'nonce-{nonce}'");
    expect(findings('page', csp("script-src 'self'"), [polyfill])).toEqual(["FUD1545 add script-src 'nonce-{nonce}' @script-src"]);
  });

  it('the policy fudic against trusted-types of another name: add it', () => {
    const text = csp("require-trusted-types-for 'script'; trusted-types otra");
    expect(findings('page', text, [policy])).toEqual(['FUD1545 add trusted-types fudic @trusted-types']);
    expect(findings('page', csp('trusted-types *'), [policy])).toEqual([]);
    expect(findings('page', csp("img-src 'self'"), [policy])).toEqual([]);
  });

  it('the same need from many pages is reported once', () => {
    expect(findings('page', csp("script-src 'self'"), [polyfill, polyfill])).toHaveLength(1);
  });

  it("an inline script: a nonce lets it in; 'unsafe-inline' only without a hash or 'strict-dynamic'", () => {
    expect(findings('page', csp("script-src 'self' 'unsafe-inline'"), [polyfill])).toEqual([]);
    expect(findings('page', csp("script-src 'sha256-a=' 'unsafe-inline'"), [polyfill])).toEqual(["FUD1545 add script-src 'nonce-{nonce}' @script-src"]);
    expect(findings('page', csp("script-src 'strict-dynamic' 'unsafe-inline'"), [polyfill])).toEqual(["FUD1545 add script-src 'nonce-{nonce}' @script-src"]);
  });

  it("an inline style: 'unsafe-inline' is the suggestion, the nonce beside a hash", () => {
    expect(findings('page', csp("style-src 'self'"), [style])).toEqual(["FUD1545 add style-src 'unsafe-inline' @style-src"]);
    expect(findings('page', csp("style-src 'sha256-a='"), [style])).toEqual(["FUD1545 add style-src 'nonce-{nonce}' @style-src"]);
    expect(findings('page', csp("style-src-elem 'nonce-{nonce}'; style-src 'none'"), [style])).toEqual([]);
  });

  it("a script from the app: with 'strict-dynamic' only the nonce; without it, 'self' or a scheme", () => {
    expect(findings('page', csp("script-src 'strict-dynamic' 'self'"), [main])).toEqual(["FUD1545 add script-src 'nonce-{nonce}' @script-src"]);
    expect(findings('page', csp('script-src https:'), [main])).toEqual([]);
    expect(findings('page', csp("script-src 'nonce-{nonce}'"), [main])).toEqual([]);
    expect(findings('page', csp("script-src 'none'"), [main])).toEqual(["FUD1545 add script-src 'self' @script-src"]);
  });

  it('default-src stands behind script-src; no directive at all lets it in', () => {
    expect(findings('page', csp("default-src 'self'"), [polyfill])).toEqual(["FUD1545 add default-src 'nonce-{nonce}' @default-src"]);
    expect(findings('page', csp("img-src 'self'"), [polyfill, main, style])).toEqual([]);
  });
});

describe('FUD1548: the Service Worker policy blocks its linker (criterion 13)', () => {
  it("without 'unsafe-eval', naming the linker", () => {
    const [finding] = checkNeeds('sw', cspOf('sw', csp("script-src 'self'")), [linker], 'sw.headers');
    expect(finding!.diagnostic).toMatchObject({ code: 'FUD1548', severity: 'warning' });
    expect(finding!.diagnostic.message).toContain('blocks the route linker');
    expect(findings('sw', csp("script-src 'self'"), [linker])).toEqual(["FUD1548 add script-src 'unsafe-eval' @script-src"]);
  });

  it("'unsafe-eval' in default-src counts", () => {
    expect(findings('sw', csp("default-src 'self' 'unsafe-eval'"), [linker])).toEqual([]);
  });
});

describe('FUD1556: tomorrow, without touching code (criterion 14)', () => {
  it("a linker that needs nothing: the 'unsafe-eval' of sw.headers can go", () => {
    expect(findings('sw', HEADERS_TEMPLATES.sw, [])).toEqual(["FUD1556 remove script-src 'unsafe-eval' @'unsafe-eval'"]);
    const [finding] = checkNeeds('sw', cspOf('sw', HEADERS_TEMPLATES.sw), [], 'sw.headers');
    expect(finding!.diagnostic).toMatchObject({ code: 'FUD1556', severity: 'hint' });
  });

  it('an app with no hydrating page: the nonce and the policy name can go; what the author added is not looked at', () => {
    expect(findings('page', HEADERS_TEMPLATES.page, [style])).toEqual([
      "FUD1556 remove script-src 'nonce-{nonce}' @'nonce-{nonce}'",
      'FUD1556 remove trusted-types fudic @fudic',
    ]);
    expect(findings('page', csp("script-src 'self' 'unsafe-eval'; trusted-types mine"), [])).toEqual([]);
  });

  it('a nonce some need goes through is kept; one in a directive nobody reaches is not', () => {
    const text = csp("script-src 'nonce-{nonce}'; style-src 'nonce-{nonce}'");
    expect(findings('page', text, [polyfill])).toEqual(["FUD1556 remove style-src 'nonce-{nonce}' @'nonce-{nonce}'"]);
    expect(findings('page', csp("script-src 'self' 'nonce-{nonce}'"), [main])).toEqual(["FUD1556 remove script-src 'nonce-{nonce}' @'nonce-{nonce}'"]);
  });
});

describe('readCspNeeds (SDD-84 §3.4): what the build left for the editor', () => {
  it('the needs of each file, the ones of a shape no piece declares dropped', () => {
    const text = JSON.stringify({
      'page.headers': [
        { loads: 'inline-script', piece: 'the style polyfill' },
        { loads: 'policy', policy: 'fudic', piece: 'the policy' },
        { loads: 'policy', piece: 'no name' },
        { loads: 'x', piece: 'p' },
        { loads: 'eval' },
        null,
        'eval',
      ],
      'sw.headers': [{ loads: 'eval', piece: 'the linker' }],
    });
    expect(readCspNeeds(text)).toEqual({
      page: [
        { loads: 'inline-script', piece: 'the style polyfill' },
        { loads: 'policy', policy: 'fudic', piece: 'the policy' },
      ],
      sw: [{ loads: 'eval', piece: 'the linker' }],
    });
    expect(CSP_NEEDS_FILE).toBe('.fudic/csp-needs.json');
  });

  it('nothing from a file that is not there, does not read, or is no object', () => {
    expect(readCspNeeds(undefined)).toEqual({});
    expect(readCspNeeds('{ nope')).toEqual({});
    expect(readCspNeeds('[1]')).toEqual({});
    expect(readCspNeeds('7')).toEqual({});
    expect(readCspNeeds('{"page.headers": 1}')).toEqual({});
  });
});

describe('cspOf', () => {
  it('the CSP among the entries, as written; undefined without one', () => {
    const text = "X-A: 1\ncontent-security-policy:\n  script-src 'self'\n";
    const { entries } = parseHeaders('page', text);
    expect(cspAmong(text, entries)!.directives.map((d) => [d.name, d.sources.map((s) => s.text)])).toEqual([['script-src', ["'self'"]]]);
    expect(cspAmong('X-A: 1\n', parseHeaders('page', 'X-A: 1\n').entries)).toBeUndefined();
  });

  it('the lists the editor completes from', () => {
    expect(SOURCE_LIST_DIRECTIVES).toContain('script-src');
    expect(SOURCE_LIST_DIRECTIVES).not.toContain('sandbox');
    expect(CACHE_CONTROL_DIRECTIVES).toEqual(expect.arrayContaining(['max-age', 'immutable', 'no-cache']));
  });
});
