/**
 * SDD-84 criteria 4–14, 16, 17, 20, 21 and 33 in the editor: the three `.headers` validated while
 * they are written, with the span the reader points at; what the build left in
 * `.fudic/csp-needs.json` checked against the buffer, with its bulbs; the completion, the hover and
 * the other bulbs of §3.8. Any other document gets nothing.
 */

import { HEADERS_TEMPLATES } from '@fudic/config';
import type { CodeAction, CompletionItem, CompletionList, Hover } from '@volar/language-service';
import { describe, expect, it } from 'vitest';
import type { Diagnostic, TextEdit } from 'vscode-languageserver-protocol';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { analyzeHeaders, createHeadersService, headersKindOf } from '../../src/headers/service.js';
import { ProjectConfigs } from '../../src/project-config.js';
import { RequestStats } from '../../src/stats.js';
import { fakeServiceContext, TOKEN } from '../_lsp.js';
import { memoryFs } from '../_support.js';

const APP: Readonly<Record<string, string>> = {
  '/p/fudic.json': JSON.stringify({ id: 'p', diagnostics: { FUD1549: 'error' } }),
  '/p/sw.json': JSON.stringify({ shell: [] }),
};

const POLYFILL = { loads: 'inline-script', piece: 'the style polyfill' };
const LINKER = { loads: 'eval', piece: 'the linker of the Service Worker' };

/** The service over `files`, as the server wires it. */
function serviceOver(files: Readonly<Record<string, string>> = APP, wired = true) {
  const configs = new ProjectConfigs(memoryFs(files));
  const deps = wired
    ? {
        stats: new RequestStats(),
        readFile: (path: string) => files[path],
        projectFor: (path: string) => configs.projectFor(path),
        policyFor: (path: string) => configs.policyFor(path),
        configFileFor: (path: string) => configs.configFileFor(path),
      }
    : { stats: new RequestStats(), readFile: (path: string) => files[path] };
  return createHeadersService(deps).create(fakeServiceContext({}));
}

const docOf = (file: string, text: string, dir = '/p'): TextDocument => TextDocument.create(URI.file(`${dir}/${file}`).toString(), 'fudheaders', 1, text);

/** Each diagnostic as `code text-under-it`. */
async function diagnose(file: string, text: string, files?: Readonly<Record<string, string>>): Promise<string[]> {
  const doc = docOf(file, text);
  const found = ((await serviceOver(files).provideDiagnostics!(doc, TOKEN)) ?? []) as Diagnostic[];
  return found.map((d) => `${String(d.code)} ${text.slice(doc.offsetAt(d.range.start), doc.offsetAt(d.range.end))}`);
}

const page = (text: string, files?: Readonly<Record<string, string>>) => diagnose('page.headers', text, files);

describe('which documents', () => {
  it('the three files by name, and nothing else', async () => {
    expect(headersKindOf('file:///p/page.headers')).toBe('page');
    expect(headersKindOf('file:///p/sw.headers')).toBe('sw');
    expect(headersKindOf('file:///p/assets.headers')).toBe('assets');
    expect(headersKindOf('file:///p/other.headers')).toBeUndefined();
    const service = serviceOver();
    const other = TextDocument.create('file:///p/fudic.json', 'json', 1, '{}');
    expect(await service.provideDiagnostics!(other, TOKEN)).toBeUndefined();
    expect(await service.provideCompletionItems!(other, { line: 0, character: 0 }, { triggerKind: 1 }, TOKEN)).toBeUndefined();
    expect(await service.provideHover!(other, { line: 0, character: 0 }, TOKEN)).toBeUndefined();
    expect(await service.provideCodeActions!(other, { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, { diagnostics: [] }, TOKEN)).toBeUndefined();
  });
});

describe('what the reader says, while it is written (criterion 33)', () => {
  it('the templates say nothing (criterion 12)', async () => {
    expect(await page(HEADERS_TEMPLATES.page)).toEqual([]);
    expect(await diagnose('sw.headers', HEADERS_TEMPLATES.sw)).toEqual([]);
    expect(await diagnose('assets.headers', HEADERS_TEMPLATES.assets)).toEqual([]);
  });

  it('a continuation of a header that takes none is FUD1540 (criterion 4)', async () => {
    expect(await page('Cache-Control: no-cache\n  no-store\nX-Custom: a\n  b\n')).toEqual(['FUD1540 b']);
  });

  it('a header with no path in assets.headers, and a path in page.headers, are FUD1540 (criterion 5)', async () => {
    expect(await diagnose('assets.headers', 'Cache-Control: no-cache\n')).toEqual(['FUD1540 Cache-Control: no-cache']);
    expect(await page('/assets/**\n')).toEqual(['FUD1540 /assets/**']);
  });

  it('a header written twice, and one out of ASCII, are FUD1541 (criterion 6)', async () => {
    expect(await page('X-A: 1\nx-a: 2\nX-Ñ: 1\nX-B: ñ\n')).toEqual(['FUD1541 x-a', 'FUD1541 X-Ñ', 'FUD1541 ñ']);
  });

  it("fudic's own headers are FUD1542 (criterion 7)", async () => {
    expect(await page('Content-Type: text/html\nLink: </a>; rel=preload\n')).toEqual(['FUD1542 Content-Type', 'FUD1542 Link']);
    expect(await diagnose('sw.headers', 'Cache-Control: no-cache\n')).toEqual(['FUD1542 Cache-Control']);
    expect(await diagnose('assets.headers', '/fudic-sw.js\n  X-A: 1\n')).toEqual(['FUD1542 /fudic-sw.js']);
  });

  it('a value the header does not take is FUD1543 (criterion 8)', async () => {
    expect(await page('Cross-Origin-Opener-Policy: same-site\nCache-Control: max-age=mucho\nX-A:\n')).toEqual([
      'FUD1543 same-site',
      'FUD1543 max-age=mucho',
      'FUD1543 X-A',
    ]);
  });

  it('a directive that does not exist is FUD1544 (criterion 9)', async () => {
    expect(await page("Content-Security-Policy:\n  script-srcc 'self'\n  object-src 'none'\n  base-uri 'none'\n  frame-ancestors 'none'\n")).toEqual([
      'FUD1544 script-srcc',
    ]);
  });

  it('a placeholder that is not one is FUD1546 (criterion 11)', async () => {
    const strict = "  object-src 'none'\n  base-uri 'none'\n  frame-ancestors 'none'\n";
    expect(await page(`Content-Security-Policy:\n  script-src 'nonce-abc123'\n  img-src https://{nonce}.x {otro}\n${strict}`)).toEqual([
      "FUD1546 'nonce-abc123'",
      'FUD1546 https://{nonce}.x',
      'FUD1546 {otro}',
    ]);
    expect(await diagnose('sw.headers', "Content-Security-Policy: script-src 'nonce-{nonce}'\n")).toEqual(["FUD1546 'nonce-{nonce}'"]);
  });

  it("what lets in more than a page needs is FUD1547, unless 'strict-dynamic' makes the browser ignore it (criterion 12)", async () => {
    const rest = "  object-src 'none'\n  base-uri 'none'\n";
    expect(await page(`Content-Security-Policy:\n  script-src 'nonce-{nonce}' https:\n${rest}  frame-ancestors 'none'\n`)).toEqual(['FUD1547 https:']);
    expect(await page(`Content-Security-Policy:\n  script-src 'nonce-{nonce}' 'strict-dynamic' https:\n${rest}  frame-ancestors 'none'\n`)).toEqual([]);
    expect(await page(`Content-Security-Policy:\n  script-src 'nonce-{nonce}' 'strict-dynamic'\n${rest}`)).toEqual(['FUD1547 Content-Security-Policy']);
  });

  it('a referrer policy that leaves back empty is FUD1549, and this project raises it (criterion 16)', async () => {
    const doc = docOf('page.headers', 'Referrer-Policy: no-referrer\n');
    const found = (await serviceOver().provideDiagnostics!(doc, TOKEN)) as Diagnostic[];
    expect(found.map((d) => [d.code, d.severity])).toEqual([['FUD1549', 1]]);
    expect(found[0]!.codeDescription?.href).toContain('FUD1549');
    // Without a project, as it is: a warning.
    const bare = (await serviceOver({}, false).provideDiagnostics!(doc, TOKEN)) as Diagnostic[];
    expect(bare.map((d) => [d.code, d.severity])).toEqual([['FUD1549', 2]]);
  });

  it('HSTS preload without what it requires is FUD1550 (criterion 17)', async () => {
    expect(await page('Strict-Transport-Security: max-age=86400; preload\n')).toEqual(['FUD1550 preload', 'FUD1550 preload']);
  });

  it('a headers file that applies to nothing is FUD1554, and nothing else of it is read (criterion 20)', async () => {
    const lib = { '/p/fudic.json': JSON.stringify({ kind: 'lib', prefix: 'ui' }) };
    expect(await page('X-A:\n', lib)).toEqual(['FUD1554 ']);
    expect(await diagnose('sw.headers', 'Cache-Control: x\n', { '/p/fudic.json': '{"id":"p"}' })).toEqual(['FUD1554 ']);
  });

  it('a fud-disable comment silences a warning on its line; the project can make it an error (criterion 21)', async () => {
    const rest = "  object-src 'none'\n  base-uri 'none'\n  frame-ancestors 'none'\n";
    const text = `Content-Security-Policy:\n  # fud-disable-next-line FUD1547: the video CDN needs it\n  script-src 'nonce-{nonce}' https:\n${rest}`;
    expect(await page(text)).toEqual([]);
    const raised = { ...APP, '/p/fudic.json': JSON.stringify({ id: 'p', diagnostics: { FUD1547: 'error' } }) };
    const doc = docOf('page.headers', text.replace('  # fud-disable-next-line FUD1547: the video CDN needs it\n', ''));
    const found = (await serviceOver(raised).provideDiagnostics!(doc, TOKEN)) as Diagnostic[];
    expect(found.map((d) => [d.code, d.severity])).toEqual([['FUD1547', 1]]);
  });
});

describe("what the build's needs say, from .fudic/csp-needs.json (criteria 10, 13, 14, 33)", () => {
  const STRICT = "  object-src 'none'\n  base-uri 'none'\n  frame-ancestors 'none'\n";
  const withNeeds = (needs: unknown): Readonly<Record<string, string>> => ({ ...APP, '/p/.fudic/csp-needs.json': JSON.stringify(needs) });

  it('before any build the editor says nothing of them', async () => {
    expect(await page(`Content-Security-Policy:\n  script-src 'self'\n${STRICT}`)).toEqual([]);
  });

  it("a page that hydrates with script-src 'self' and no nonce is FUD1545, naming the polyfill, with its bulb (criterion 10)", async () => {
    const text = `Content-Security-Policy:\n  script-src 'self'\n${STRICT}`;
    const files = withNeeds({ 'page.headers': [POLYFILL] });
    expect(await page(text, files)).toEqual(['FUD1545 script-src']);
    const doc = docOf('page.headers', text);
    const [found] = (await serviceOver(files).provideDiagnostics!(doc, TOKEN)) as Diagnostic[];
    expect(found!.message).toContain('the style polyfill');
    const actions = await bulbs(serviceOver(files), doc, found!.range);
    const add = actions.find((a) => a.title === "Add 'nonce-{nonce}'")!;
    expect(applied(doc, add)).toContain("  script-src 'self' 'nonce-{nonce}'\n");
  });

  it('a trusted-types that does not name fudic is FUD1545, naming the policy (criterion 10)', async () => {
    const text = `Content-Security-Policy:\n  script-src 'self'\n${STRICT}  require-trusted-types-for 'script'\n  trusted-types otra\n`;
    const files = withNeeds({ 'page.headers': [{ loads: 'policy', policy: 'fudic', piece: 'the Trusted Types policy' }] });
    expect(await page(text, files)).toEqual(['FUD1545 trusted-types']);
    const doc = docOf('page.headers', text);
    const actions = await bulbs(serviceOver(files), doc, rangeOf(doc, 'trusted-types otra'));
    expect(applied(doc, actions.find((a) => a.title === 'Add fudic')!)).toContain('  trusted-types otra fudic\n');
  });

  it("sw.headers without 'unsafe-eval' is FUD1548, naming the linker (criterion 13)", async () => {
    const files = withNeeds({ 'page.headers': [], 'sw.headers': [LINKER] });
    const doc = docOf('sw.headers', 'Content-Security-Policy:\n  default-src\n');
    const found = (await serviceOver(files).provideDiagnostics!(doc, TOKEN)) as Diagnostic[];
    expect(found.map((d) => d.code)).toEqual(['FUD1548']);
    expect(found[0]!.message).toContain('the linker');
    const actions = await bulbs(serviceOver(files), doc, found[0]!.range);
    // No source yet: it goes after the name.
    expect(applied(doc, actions.find((a) => a.title === "Add 'unsafe-eval'")!)).toBe("Content-Security-Policy:\n  default-src 'unsafe-eval'\n");
  });

  it("tomorrow without touching code: a linker that needs nothing makes 'unsafe-eval' FUD1556, with its bulb (criterion 14)", async () => {
    const files = withNeeds({ 'page.headers': [], 'sw.headers': [] });
    const doc = docOf('sw.headers', HEADERS_TEMPLATES.sw);
    const found = (await serviceOver(files).provideDiagnostics!(doc, TOKEN)) as Diagnostic[];
    expect(found.map((d) => [d.code, d.severity])).toEqual([['FUD1556', 4]]);
    const actions = await bulbs(serviceOver(files), doc, found[0]!.range);
    expect(applied(doc, actions.find((a) => a.title === "Remove 'unsafe-eval'")!)).toContain("  script-src 'self'\n");
    // And a page with nothing that hydrates: its nonce is kept for nothing.
    expect((await page(HEADERS_TEMPLATES.page, files)).filter((d) => d.startsWith('FUD1556'))).toEqual([
      "FUD1556 'nonce-{nonce}'",
      'FUD1556 fudic',
    ]);
  });

  it('a needs file that does not read, or says nothing of a file, says nothing', async () => {
    const text = `Content-Security-Policy:\n  script-src 'self'\n${STRICT}`;
    expect(await page(text, { ...APP, '/p/.fudic/csp-needs.json': '{ nope' })).toEqual([]);
    expect(await page(text, withNeeds({ 'sw.headers': [LINKER] }))).toEqual([]);
    // A need of a shape no piece declares is dropped, and the rest kept.
    expect(await page(text, withNeeds({ 'page.headers': [{ loads: 'x', piece: 'p' }, { piece: 1 }, null, POLYFILL] }))).toEqual(['FUD1545 script-src']);
    // Without a CSP, everything gets in.
    expect(await page('X-A: 1\n', withNeeds({ 'page.headers': [POLYFILL] }))).toEqual([]);
  });
});

/** The bulbs over `range` of `doc`. */
async function bulbs(service: ReturnType<typeof serviceOver>, doc: TextDocument, range: Diagnostic['range']): Promise<CodeAction[]> {
  return ((await service.provideCodeActions!(doc, range, { diagnostics: [] }, TOKEN)) ?? []) as CodeAction[];
}

/** The text of `doc` with the edit of `action` applied. */
function applied(doc: TextDocument, action: CodeAction): string {
  const edits = action.edit!.changes![doc.uri]! as TextEdit[];
  return TextDocument.applyEdits(doc, edits);
}

/** The range of the first `needle` in `doc`. */
function rangeOf(doc: TextDocument, needle: string): Diagnostic['range'] {
  const at = doc.getText().indexOf(needle);
  return { start: doc.positionAt(at), end: doc.positionAt(at + needle.length) };
}

describe('the bulbs (§3.8)', () => {
  it('«Change to same-origin» on a COOP value that looks like it (criterion 8)', async () => {
    const doc = docOf('page.headers', 'Cross-Origin-Opener-Policy: same-site; report-to="x"\n');
    const actions = await bulbs(serviceOver(), doc, rangeOf(doc, 'same-site'));
    expect(applied(doc, actions.find((a) => a.title === 'Change to same-origin')!)).toBe('Cross-Origin-Opener-Policy: same-origin; report-to="x"\n');
  });

  it('no change when nothing looks like it, nor for a header with no closed values', async () => {
    const doc = docOf('page.headers', 'Cross-Origin-Opener-Policy: zzzzzzzzzzzzzzzzzz\nCache-Control: max-age=mucho\nX-A:\n');
    const all = await bulbs(serviceOver(), doc, { start: doc.positionAt(0), end: doc.positionAt(doc.getText().length) });
    expect(all.filter((a) => a.title.startsWith('Change to'))).toEqual([]);
  });

  it('«Remove the line» takes a header with its continuations, a block with its headers, or the one line', async () => {
    const text = 'Cache-Control: no-cache,\n  no-store\nX-A: 1\n';
    const doc = docOf('sw.headers', text);
    const actions = await bulbs(serviceOver(), doc, rangeOf(doc, 'Cache-Control'));
    expect(applied(doc, actions.find((a) => a.title === 'Remove the line')!)).toBe('X-A: 1\n');

    const csp = "Content-Security-Policy:\n  img-src {otro}\n  object-src 'none'\n";
    const cspDoc = docOf('page.headers', csp);
    const removed = await bulbs(serviceOver(), cspDoc, rangeOf(cspDoc, '{otro}'));
    expect(applied(cspDoc, removed.find((a) => a.title === 'Remove the line')!)).toBe("Content-Security-Policy:\n  object-src 'none'\n");

    const whole = "X-Custom: {otro}\nX-B: 1";
    const wholeDoc = docOf('page.headers', whole);
    const gone = await bulbs(serviceOver(), wholeDoc, rangeOf(wholeDoc, '{otro}'));
    expect(applied(wholeDoc, gone.find((a) => a.title === 'Remove the line')!)).toBe('X-B: 1');

    const assets = '/fudic-sw.js\n  X-A: 1\n  X-B: 2\n/**\n  Cache-Control: no-cache\n';
    const assetsDoc = docOf('assets.headers', assets);
    const block = await bulbs(serviceOver(), assetsDoc, rangeOf(assetsDoc, '/fudic-sw.js'));
    expect(applied(assetsDoc, block.find((a) => a.title === 'Remove the line')!)).toBe('/**\n  Cache-Control: no-cache\n');

    const empty = '/fudic-routes.json\n/**\n  Cache-Control: no-cache\n';
    const emptyDoc = docOf('assets.headers', empty);
    const alone = await bulbs(serviceOver(), emptyDoc, rangeOf(emptyDoc, '/fudic-routes.json'));
    expect(applied(emptyDoc, alone.find((a) => a.title === 'Remove the line')!)).toBe('/**\n  Cache-Control: no-cache\n');

    const nested = '/**\n  Content-Type: x\n';
    const nestedDoc = docOf('assets.headers', nested);
    const header = await bulbs(serviceOver(), nestedDoc, rangeOf(nestedDoc, 'Content-Type'));
    expect(applied(nestedDoc, header.find((a) => a.title === 'Remove the line')!)).toBe('/**\n');
  });

  it("the comment bulbs write a # line, and «explain» is there", async () => {
    const doc = docOf('page.headers', 'Referrer-Policy: origin\n');
    const actions = await bulbs(serviceOver({ '/p/fudic.json': '{"id":"p"}' }), doc, rangeOf(doc, 'origin'));
    const titles = actions.map((a) => a.title);
    expect(titles).toContain('Silence FUD1549 on this line');
    expect(titles).toContain('Turn FUD1549 off in the project');
    expect(titles.some((t) => t.includes('FUD1549') && t.toLowerCase().includes('explain'))).toBe(true);
    expect(applied(doc, actions.find((a) => a.title === 'Silence FUD1549 on this line')!)).toBe(
      '# fud-disable-next-line FUD1549: \nReferrer-Policy: origin\n',
    );
    // Without the project's configuration, no bulb turns it off there.
    const bare = await bulbs(serviceOver({}, false), doc, rangeOf(doc, 'origin'));
    expect(bare.map((a) => a.title)).not.toContain('Turn FUD1549 off in the project');
  });

  it('nothing outside the range', async () => {
    const doc = docOf('page.headers', 'X-A: 1\nReferrer-Policy: origin\n');
    expect(await bulbs(serviceOver(), doc, rangeOf(doc, 'X-A'))).toEqual([]);
  });
});

/** The labels completed at the `|` of `marked`, and the range they replace as text. */
async function complete(file: string, marked: string): Promise<{ labels: string[]; replaces: string; items: CompletionItem[] } | undefined> {
  const at = marked.indexOf('|');
  const text = marked.replace('|', '');
  const doc = docOf(file, text);
  const list = (await serviceOver().provideCompletionItems!(doc, doc.positionAt(at), { triggerKind: 1 }, TOKEN)) as CompletionList | undefined;
  if (list === undefined || list === null) return undefined;
  const edit = list.items[0]?.textEdit as TextEdit | undefined;
  const replaces = edit === undefined ? '' : text.slice(doc.offsetAt(edit.range.start), doc.offsetAt(edit.range.end));
  return { labels: list.items.map((i) => i.label), replaces, items: list.items };
}

describe('the completion (§3.8, criterion 33)', () => {
  it('completes `script-` with the directives of script-src', async () => {
    const found = (await complete('page.headers', 'Content-Security-Policy:\n  default-src \'self\'\n  script-|'))!;
    expect(found.labels).toEqual(expect.arrayContaining(['script-src', 'script-src-elem', 'script-src-attr']));
    expect(found.replaces).toBe('script-');
  });

  it('a directive after the colon, after a ; and on a fresh line', async () => {
    expect((await complete('page.headers', 'Content-Security-Policy: |'))!.labels).toContain('default-src');
    expect((await complete('page.headers', "Content-Security-Policy: default-src 'self'; im|"))!.replaces).toBe('im');
    expect((await complete('page.headers', 'Content-Security-Policy:\n  |'))!.labels).toContain('frame-ancestors');
  });

  it("the sources of a directive: the nonce only in the page's policy", async () => {
    const pageSources = (await complete('page.headers', "Content-Security-Policy:\n  script-src 'se|"))!;
    expect(pageSources.labels).toEqual(expect.arrayContaining(["'nonce-{nonce}'", "'self'", "'strict-dynamic'", 'https:']));
    expect(pageSources.replaces).toBe("'se");
    expect((await complete('sw.headers', "Content-Security-Policy:\n  script-src 'self' |"))!.labels).not.toContain("'nonce-{nonce}'");
    expect((await complete('page.headers', 'Content-Security-Policy:\n  require-trusted-types-for |'))!.labels).toEqual(["'script'"]);
    expect((await complete('page.headers', 'Content-Security-Policy:\n  trusted-types |'))!.labels).toEqual(['fudic', "'allow-duplicates'", "'none'"]);
    expect((await complete('page.headers', 'Content-Security-Policy:\n  webrtc |'))!.labels).toEqual(["'allow'", "'block'"]);
    expect((await complete('page.headers', 'Content-Security-Policy:\n  sandbox |'))!.labels).toEqual([]);
  });

  it('the names of the headers, at column 0 and under a path', async () => {
    const names = (await complete('page.headers', 'Cross|'))!;
    expect(names.labels).toEqual(expect.arrayContaining(['Content-Security-Policy', 'Cross-Origin-Opener-Policy', 'Referrer-Policy']));
    expect((names.items[0]!.textEdit as TextEdit).newText).toBe('Content-Security-Policy: ');
    expect((await complete('assets.headers', '/**\n  Cache|'))!.labels).toContain('Cache-Control');
    expect((await complete('assets.headers', '/**\n  Cache-Control: no-cache\n  |'))!.labels).toContain('Cache-Control');
  });

  it('the closed values, and the directives of Cache-Control', async () => {
    expect((await complete('page.headers', 'Cross-Origin-Opener-Policy: s|'))!.labels).toEqual([
      'same-origin',
      'same-origin-allow-popups',
      'noopener-allow-popups',
      'unsafe-none',
    ]);
    expect((await complete('page.headers', 'Referrer-Policy: |'))!.labels).toContain('strict-origin-when-cross-origin');
    const cache = (await complete('assets.headers', '/assets/**\n  Cache-Control: public,\n    max|'))!;
    expect(cache.labels).toEqual(expect.arrayContaining(['max-age', 'immutable', 'no-cache']));
    expect(cache.replaces).toBe('max');
  });

  it('nothing in a comment, on a path, in the value of a header it does not know, or with no header above', async () => {
    expect(await complete('page.headers', '# Cont|')).toBeUndefined();
    expect(await complete('assets.headers', '/ass|')).toBeUndefined();
    expect(await complete('page.headers', 'X-Custom: a|')).toBeUndefined();
    expect(await complete('page.headers', '  orphan|')).toBeUndefined();
    expect(await complete('page.headers', '/x\n  orphan|')).toBeUndefined();
    expect(await complete('assets.headers', 'X: 1\n  orphan|')).toBeUndefined();
  });

  it('the codes of a fud-disable comment', async () => {
    const found = (await complete('page.headers', 'Referrer-Policy: origin\n# fud-disable FUD15|'))!;
    expect(found.labels).toContain('FUD1549');
  });
});

/** The hover at the `|` of `marked`: its markdown and the text it covers. */
async function hover(file: string, marked: string): Promise<{ markdown: string; over: string } | undefined> {
  const at = marked.indexOf('|');
  const text = marked.replace('|', '');
  const doc = docOf(file, text);
  const found = (await serviceOver().provideHover!(doc, doc.positionAt(at), TOKEN)) as Hover | undefined;
  if (found === undefined || found === null) return undefined;
  const value = (found.contents as { value: string }).value;
  return { markdown: value, over: found.range === undefined ? '' : text.slice(doc.offsetAt(found.range.start), doc.offsetAt(found.range.end)) };
}

describe('the hover (§3.8)', () => {
  it('what a header does, with MDN', async () => {
    const found = (await hover('page.headers', 'Cross-Origin|-Opener-Policy: same-origin'))!;
    expect(found.over).toBe('Cross-Origin-Opener-Policy');
    expect(found.markdown).toContain('same-origin-allow-popups');
    expect(found.markdown).toContain('https://developer.mozilla.org/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy');
    expect((await hover('assets.headers', '/**\n  cache-con|trol: no-cache'))!.markdown).toContain('**Cache-Control**');
  });

  it('what a directive does, with MDN, on its line or after the colon', async () => {
    const found = (await hover('page.headers', "Content-Security-Policy:\n  frame-anc|estors 'none'"))!;
    expect(found.over).toBe('frame-ancestors');
    expect(found.markdown).toContain('clickjacking');
    expect(found.markdown).toContain('/Content-Security-Policy/frame-ancestors');
    expect((await hover('page.headers', "Content-Security-Policy: default-src 'self'; obj|ect-src 'none'"))!.over).toBe('object-src');
  });

  it("nothing over an unknown header, a word that is no directive, another header's value or a line out of place", async () => {
    expect(await hover('page.headers', 'X-Cus|tom: 1')).toBeUndefined();
    expect(await hover('page.headers', "Content-Security-Policy:\n  script-src 'se|lf'")).toBeUndefined();
    expect(await hover('page.headers', 'Cross-Origin-Opener-Policy: same-|origin')).toBeUndefined();
    expect(await hover('page.headers', '/as|sets/**')).toBeUndefined();
    expect(await hover('assets.headers', '/**\n  Cache-Control: no-cache\n  % no header|')).toBeUndefined();
  });

  it('the code of a fud-disable comment', async () => {
    expect((await hover('page.headers', '# fud-disable FUD15|49: why\nReferrer-Policy: origin'))!.markdown).toContain('**FUD1549**');
  });
});

describe('analyzeHeaders', () => {
  it('a file in a folder with no project is an app', () => {
    const analysis = analyzeHeaders(docOf('page.headers', 'X-A: 1\n', '/q'), { readFile: () => undefined, stats: new RequestStats() })!;
    expect(analysis.found).toEqual([]);
    expect(analysis.entries).toHaveLength(1);
  });
});

describe('the corners', () => {
  it('«Remove the line» on the last line, with no newline after it', async () => {
    const doc = docOf('page.headers', 'X-B: 1\nX-Custom: {otro}');
    const actions = await bulbs(serviceOver(), doc, rangeOf(doc, '{otro}'));
    expect(applied(doc, actions.find((a) => a.title === 'Remove the line')!)).toBe('X-B: 1\n');
  });

  it('«Change to» on a header of a block of assets.headers', async () => {
    const doc = docOf('assets.headers', '/**\n  Cross-Origin-Opener-Policy: same-sit\n');
    const actions = await bulbs(serviceOver(), doc, rangeOf(doc, 'same-sit'));
    expect(actions.map((a) => a.title)).toContain('Change to same-origin');
  });

  it('a blank line between a header and the line being written', async () => {
    expect((await complete('page.headers', 'Content-Security-Policy:\n\n  # a comment\n  |'))!.labels).toContain('img-src');
  });

  it('the hover of a code with no project policy wired', async () => {
    const doc = docOf('page.headers', '# fud-disable FUD1549: why\nReferrer-Policy: origin');
    const found = (await serviceOver({}, false).provideHover!(doc, doc.positionAt(18), TOKEN)) as Hover;
    expect((found.contents as { value: string }).value).toContain('**FUD1549**');
  });
});
