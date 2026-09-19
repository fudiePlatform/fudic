/**
 * SDD-29 §5 — the diagnostics of everything that runs AFTER the expansion, back in the files
 * their authors can open.
 *
 * The pass that produced them speaks in offsets of the text the compiler made; a host reports
 * against files. This is the one place the two meet.
 */

import { describe, expect, it } from 'vitest';
import { parseDocument } from '../../src/html/index.js';
import { atConstructs } from '../../src/constructs.js';
import { structureDocument } from '../../src/document/index.js';
import { expandDocument, remapDiagnostics } from '../../src/expand/index.js';
import { errorDiag, relatedError, type Diagnostic, type ResolveIo } from '../../src/types/index.js';

const ENTRY = '/app/page.fud';
const component = (body: string, head = ''): string =>
  `${head}<app-page><template shadowrootmode="open">${body}</template></app-page>`;

const FILES: Record<string, string> = {
  [ENTRY]: component('<p>@render card(data.title)</p>', '<link rel="snippet" href="./ui.fud">'),
  '/app/ui.fud': '@snippet card(t: string) { <article class="card">@t</article> }',
};

const io: ResolveIo = {
  read(path) {
    const source = FILES[path];
    if (source === undefined) throw new Error(`no such file: ${path}`);
    return source;
  },
  resolve(fromPath, href) {
    const dir = fromPath.slice(0, fromPath.lastIndexOf('/'));
    return `${dir}/${href.replace(/^\.\//u, '')}`;
  },
};

function expanded(): { source: string; map: ReturnType<typeof expandDocument>['map'] } {
  const source = FILES[ENTRY]!;
  const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
  const out = expandDocument(ENTRY, source, doc, io);
  return { source: out.source, map: out.map };
}

/** A diagnostic over the text `needle` of the expanded source. */
function at(source: string, needle: string): Diagnostic {
  const start = source.indexOf(needle);
  return errorDiag('FUD9999', 'something', { start, end: start + needle.length });
}

describe('remapDiagnostics (§5)', () => {
  it('leaves one about the caller in the caller, at the same text', () => {
    const { source, map } = expanded();
    const [out] = remapDiagnostics([at(source, '<app-page>')], map, ENTRY);
    expect(out!.file).toBeUndefined();
    expect(FILES[ENTRY]!.slice(out!.span.start, out!.span.end)).toBe('<app-page>');
  });

  it('sends one about an expanded body to the snippet file (criterion 34)', () => {
    const { source, map } = expanded();
    const [out] = remapDiagnostics([at(source, 'class="card"')], map, ENTRY);
    expect(out!.file).toBe('/app/ui.fud');
    expect(FILES['/app/ui.fud']!.slice(out!.span.start, out!.span.end)).toBe('class="card"');
  });

  it('remaps the related locations too', () => {
    const { source, map } = expanded();
    const start = source.indexOf('class="card"');
    const other = source.indexOf('<app-page>');
    const diagnostic = relatedError('FUD9999', 'something', { start, end: start + 12 }, [
      { span: { start: other, end: other + 10 }, message: 'and here' },
      { span: { start: 0, end: 1 }, message: 'already placed', file: '/elsewhere.fud' },
    ]);
    const inBody = source.indexOf('<article');
    const withBody = relatedError('FUD9999', 'something', { start: other, end: other + 10 }, [
      { span: { start: inBody, end: inBody + 8 }, message: 'declared here' },
    ]);
    expect(remapDiagnostics([withBody], map, ENTRY)[0]!.related![0]!.file).toBe('/app/ui.fud');

    const [out] = remapDiagnostics([diagnostic], map, ENTRY);
    expect(out!.related![0]!.file).toBeUndefined();
    expect(FILES[ENTRY]!.slice(out!.related![0]!.span.start, out!.related![0]!.span.end)).toBe(
      '<app-page>',
    );
    // One that already names its file was produced before the expansion and is left alone.
    expect(out!.related![1]!.file).toBe('/elsewhere.fud');
  });

  it('leaves alone one that already names its file', () => {
    const { map } = expanded();
    const placed: Diagnostic = { ...errorDiag('FUD9999', 'x', { start: 0, end: 1 }), file: '/x.fud' };
    expect(remapDiagnostics([placed], map, ENTRY)[0]).toBe(placed);
  });

  it('leaves alone everything when the file was never expanded', () => {
    const source = component('<p>hi</p>');
    const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const { map } = expandDocument(ENTRY, source, doc, io);
    const one = at(source, '<p>');
    expect(remapDiagnostics([one], map, ENTRY)[0]).toBe(one);
  });

  it('leaves the related locations alone when the file was never expanded', () => {
    const source = component('<p>hi</p>');
    const doc = structureDocument(source, parseDocument(source, { atConstructs }).value).value;
    const { map } = expandDocument(ENTRY, source, doc, io);
    const one = relatedError('FUD9999', 'x', { start: 0, end: 1 }, [
      { span: { start: 2, end: 3 }, message: 'there' },
    ]);
    // Nothing moves, related included: with no table there is nothing to move it to, and the
    // diagnostic returns before its related locations are even looked at.
    expect(remapDiagnostics([one], map, ENTRY)[0]).toBe(one);
  });
});
