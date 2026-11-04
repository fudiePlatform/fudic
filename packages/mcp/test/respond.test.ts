/** The common shape of every answer, and a diagnostic as a model reads it (§3.4). */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FUD0540, FUD1400, FUD1403, FUD1406, span, type FudDiagnostic } from '@fudic/diagnostics';
import { codeTexts, outDiagnostic } from '../src/diagnostics.js';
import { respond } from '../src/respond.js';
import { VERSION } from '../src/version.js';
import { fakeProject, tempDir } from './helpers.js';

const ROOT = join('/', 'project');
const FILE = join(ROOT, 'src', 'components', 'acme-card', 'acme-card.fud');
const SOURCE = '<acme-card>\r\n  <template>\n    @foreach (const item of items) {\r      x';

describe('outDiagnostic', () => {
  const read = (file: string): string | undefined => (file === FILE ? SOURCE : undefined);

  it('file:line:column, 1-based and relative with forward slashes, and the line without its indentation', () => {
    const offset = SOURCE.indexOf('@foreach');
    const d = { ...FUD0540({ span: span(offset, offset + 8) }), file: FILE } as FudDiagnostic;
    expect(outDiagnostic(d, ROOT, read)).toEqual({
      code: 'FUD0540',
      severity: 'error',
      message: d.message,
      at: 'src/components/acme-card/acme-card.fud:3:5',
      quote: '@foreach (const item of items) {',
    });
  });

  it('on the last line, without a break after it, the quote is that line', () => {
    const last = join(ROOT, 'last.fud');
    const d = { ...FUD0540({ span: span(4, 5) }), file: last } as FudDiagnostic;
    expect(outDiagnostic(d, ROOT, (f) => (f === last ? '<p>\n  @x' : undefined))).toMatchObject({ at: 'last.fud:2:1', quote: '@x' });
  });

  it('a diagnostic of the project has no place', () => {
    expect(outDiagnostic(FUD1406(), ROOT, read)).toEqual({ code: 'FUD1406', severity: 'warning', message: FUD1406().message });
  });

  it('a file without a span keeps only the file', () => {
    const d = FUD1400({ file: join(ROOT, 'a.fud') });
    expect(outDiagnostic(d, ROOT, read)).toEqual({ code: 'FUD1400', severity: 'error', message: d.message, at: 'a.fud' });
  });

  it('fixable and the options of its repairs, when the check says them', () => {
    const d = { code: 'FUD0540', severity: 'error' as const, message: 'm', fixable: false, options: ['Key by item.id', 'Key by index'] };
    expect(outDiagnostic(d, ROOT, read)).toEqual({ code: 'FUD0540', severity: 'error', message: 'm', fixable: false, options: ['Key by item.id', 'Key by index'] });
  });

  it('a path as the caller wrote it stays as written', () => {
    const d = FUD1400({ file: '../elsewhere/x.fud' });
    expect(outDiagnostic(d, ROOT, read)).toMatchObject({ at: '../elsewhere/x.fud' });
  });

  it('a span in a file that cannot be read keeps only the file', () => {
    const d = { ...FUD0540({ span: span(0, 1) }), file: join(ROOT, 'gone.fud') } as FudDiagnostic;
    expect(outDiagnostic(d, ROOT, read)).toMatchObject({ at: 'gone.fud' });
    expect(outDiagnostic(d, ROOT, read)).not.toHaveProperty('quote');
  });
});

describe('codeTexts', () => {
  it('the why and the fix of each fudic code once, sorted; a TypeScript code has none', () => {
    const texts = codeTexts(['FUD1403', 'TS2322', 'FUD0540', 'FUD1403']);
    expect(Object.keys(texts)).toEqual(['FUD0540', 'FUD1403']);
    expect(texts['FUD1403']).toEqual({ title: 'Unknown guide topic', why: expect.any(String), fix: expect.any(String) });
  });

  it('a retired code has a why and no fix', () => {
    expect(codeTexts(['FUD0050'])['FUD0050']).not.toHaveProperty('fix');
  });
});

describe('respond', () => {
  it('version, commit, the body in its order, the diagnostics, then next', () => {
    const result = respond(fakeProject(), { body: { b: 1, a: 2 } });
    expect(result.structuredContent).toEqual({ fudicVersion: VERSION, commit: 'b59fa7d', b: 1, a: 2, diagnostics: [], next: null });
    expect(Object.keys(result.structuredContent!)).toEqual(['fudicVersion', 'commit', 'b', 'a', 'diagnostics', 'next']);
    expect(result.content).toEqual([{ type: 'text', text: JSON.stringify(result.structuredContent, null, 2) }]);
    expect(result).not.toHaveProperty('isError');
  });

  it('what failed is a diagnostic, its why under codes, and isError', () => {
    const result = respond(fakeProject(), { body: {}, diagnostics: [FUD1403({ topic: 'x', topics: ['overview'] })], next: 'Ask for overview.', failed: true });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ next: 'Ask for overview.', codes: { FUD1403: { title: 'Unknown guide topic' } } });
  });

  it('reads the file a diagnostic points at, from the disk', () => {
    const dir = tempDir({ 'a.fud': '<p>\n  @x\n' });
    try {
      const d = { ...FUD0540({ span: span(6, 8) }), file: join(dir.root, 'a.fud') } as FudDiagnostic;
      const result = respond(fakeProject(dir.root), { body: {}, diagnostics: [d] });
      expect(result.structuredContent).toMatchObject({ diagnostics: [{ at: 'a.fud:2:3', quote: '@x' }] });
      const gone = { ...d, file: join(dir.root, 'gone.fud') };
      expect(respond(fakeProject(dir.root), { body: {}, diagnostics: [gone] }).structuredContent).toMatchObject({ diagnostics: [{ at: 'gone.fud' }] });
    } finally {
      dir.dispose();
    }
  });

  it('is the same, byte for byte, for the same call', () => {
    const a = respond(fakeProject(), { body: { x: [1, 2] }, diagnostics: [FUD1406()] });
    const b = respond(fakeProject(), { body: { x: [1, 2] }, diagnostics: [FUD1406()] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
