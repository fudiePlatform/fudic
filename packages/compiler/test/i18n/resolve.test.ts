/**
 * A localized graph read back to the files on disk (SDD-58 §5): the entry's map composed with the
 * rewrite's (`OffsetMap.through`), snippets included, and the `<html lang>` of a page module.
 */

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  emitPageModule,
  localizedIo,
  resolveComponents,
  resolveDocument,
  type ResolveIo,
} from '../../src/index.js';
import { fixtureIo, fixturesDir, memoryIo } from '../emit/_support.js';
import { i18nOf } from './_compile.js';

describe('diagnostics map back to the file on disk', () => {
  it('a parse error after a rewritten phrase is reported at its offset in the original', () => {
    const source = '<app-x><template shadowrootmode="open"><p>Hola mundo</p><div></span></div></template></app-x>';
    const io = localizedIo(memoryIo({ '/c/x.fud': source }), i18nOf({ 'Hola mundo': 'Hello there, world' }));
    const { value: graph, diagnostics } = resolveDocument('/c/x.fud', io);

    expect(graph.entrySource).toContain('Hello there, world');
    expect(diagnostics.length).toBeGreaterThan(0);
    const [d] = diagnostics;
    const back = graph.entryMap.spanOf(d!.span!)!;
    expect(back.file).toBe('/c/x.fud');
    expect(source.slice(back.span.start, back.span.end)).toBe(graph.entrySource.slice(d!.span!.start, d!.span!.end));
    expect(back.span.start).toBe(source.indexOf('</span>'));
  });

  it('the origin of the entry is the text on disk', () => {
    const source = '<app-x><template shadowrootmode="open"><p>Hola</p></template></app-x>';
    const io = localizedIo(memoryIo({ '/c/x.fud': source }), i18nOf({ Hola: 'Hello' }));
    const { value: graph } = resolveDocument('/c/x.fud', io);

    expect(graph.entryOrigin.source).toBe(source);
    expect(graph.entrySource).toContain('Hello');
  });

  it('without a rewrite (no origin on the io) nothing changes', () => {
    const source = '<app-x><template shadowrootmode="open"><p>Hola</p></template></app-x>';
    const { value: graph } = resolveDocument('/c/x.fud', memoryIo({ '/c/x.fud': source }));

    expect(graph.entrySource).toBe(source);
    expect(graph.entryOrigin.source).toBe(source);
  });

  it('a file whose translation leaves it as it was maps to itself', () => {
    const source = '<app-x><template shadowrootmode="open"><p>Hola</p><div></span></div></template></app-x>';
    const io = localizedIo(memoryIo({ '/c/x.fud': source }), i18nOf({}));
    const { value: graph, diagnostics } = resolveDocument('/c/x.fud', io);

    expect(graph.entrySource).toBe(source);
    const back = graph.entryMap.spanOf(diagnostics[0]!.span!)!;
    expect(back.span.start).toBe(source.indexOf('</span>'));
  });
});

describe('snippets expanded from rewritten files (OffsetMap.through)', () => {
  const SNIPPETS = '@snippet row(label: string) {\n  <p>Fila @label de la tabla</p>\n}\n';
  const ENTRY =
    '<link rel="snippet" href="./s.fud">\n' +
    '<app-x><template shadowrootmode="open"><h1>Título</h1>@render row("a")<i>fin</i></template></app-x>';
  const files = { '/c/x.fud': ENTRY, '/c/s.fud': SNIPPETS };
  const table = { Título: 'Title', 'Fila {label} de la tabla': 'Row {label} of the table' };

  const { value: graph } = resolveDocument('/c/x.fud', localizedIo(memoryIo(files), i18nOf(table)));
  const out = graph.entrySource;

  it('expands the translated snippet into the translated entry', () => {
    expect(out).toContain('<h1>Title</h1>');
    expect(out).toContain('Row ');
    expect(out).toContain(' of the table');
  });

  it('text copied from the entry maps to the entry on disk', () => {
    const at = out.indexOf('fin');
    expect(graph.entryMap.origin(at)).toEqual({ file: '/c/x.fud', offset: ENTRY.indexOf('fin'), literal: true });
    expect(graph.entryMap.entryOffset(at)).toBe(ENTRY.indexOf('fin'));
  });

  it('text copied from the snippet maps to the snippet on disk, and to its @render for the entry', () => {
    const at = out.indexOf('</p>');
    expect(graph.entryMap.origin(at)).toEqual({ file: '/c/s.fud', offset: SNIPPETS.indexOf('</p>'), literal: true });
    expect(graph.entryMap.entryOffset(at)).toBe(ENTRY.indexOf('@render'));
  });

  it('a translated text of the entry maps to the message it replaced', () => {
    expect(graph.entryMap.entryOffset(out.indexOf('Title'))).toBe(ENTRY.indexOf('Título'));
  });

  it('a translated text of the snippet maps, for the entry, to the @render', () => {
    expect(graph.entryMap.entryOffset(out.indexOf(' of the table'))).toBe(ENTRY.indexOf('@render'));
    expect(graph.entryMap.origin(out.indexOf(' of the table'))?.file).toBe('/c/s.fud');
  });

  it('an entry with nothing to expand answers through its own rewrite', () => {
    const plain = '<app-y><template shadowrootmode="open"><p>Título</p><i>fin</i></template></app-y>';
    const { value } = resolveDocument('/c/y.fud', localizedIo(memoryIo({ '/c/y.fud': plain }), i18nOf(table)));

    expect(value.entryMap.entryOffset(value.entrySource.indexOf('fin'))).toBe(plain.indexOf('fin'));
    expect(value.entryMap.entryOffset(value.entrySource.indexOf('Title'))).toBe(plain.indexOf('Título'));
  });

  /** An io where only `localized` files were rewritten; the others are read as they are. */
  function partial(localized: readonly string[]): ResolveIo {
    const base = memoryIo(files);
    const io = localizedIo(base, i18nOf(table));
    return {
      read: (p) => (localized.includes(p) ? io.read(p) : base.read(p)),
      resolve: base.resolve,
      origin: (p) => (localized.includes(p) ? io.origin!(p) : undefined),
    };
  }

  it('a snippet file read as it is, into a rewritten entry', () => {
    const { value } = resolveDocument('/c/x.fud', partial(['/c/x.fud']));
    const text = value.entrySource;

    expect(text).toContain('<h1>Title</h1>');
    expect(text).toContain('Fila ');
    expect(value.entryMap.origin(text.indexOf('</p>'))).toEqual({ file: '/c/s.fud', offset: SNIPPETS.indexOf('</p>'), literal: true });
    expect(value.entryMap.entryOffset(text.indexOf('</p>'))).toBe(ENTRY.indexOf('@render'));
    expect(value.entryMap.entryOffset(text.indexOf('fin'))).toBe(ENTRY.indexOf('fin'));
  });

  it('a rewritten snippet file, into an entry read as it is', () => {
    const { value } = resolveDocument('/c/x.fud', partial(['/c/s.fud']));
    const text = value.entrySource;

    expect(text).toContain('<h1>Título</h1>');
    expect(text).toContain(' of the table');
    expect(value.entryMap.origin(text.indexOf('</p>'))).toEqual({ file: '/c/s.fud', offset: SNIPPETS.indexOf('</p>'), literal: true });
    expect(value.entryMap.entryOffset(text.indexOf('</p>'))).toBe(ENTRY.indexOf('@render'));
    expect(value.entryMap.entryOffset(text.indexOf('fin'))).toBe(ENTRY.indexOf('fin'));
  });

  it('a rewritten snippet expanded into an entry the locale left untouched', () => {
    const entry = ENTRY.replace('<h1>Título</h1>', '<h1>42</h1>');
    const { value } = resolveDocument('/c/x.fud', localizedIo(memoryIo({ ...files, '/c/x.fud': entry }), i18nOf(table)));

    expect(value.entrySource).toContain(' of the table');
    expect(value.entryMap.entryOffset(value.entrySource.indexOf('fin'))).toBe(entry.indexOf('fin'));
  });
});

describe('the <html> of a page with no layout (EmitOptions.i18n)', () => {
  const graph = resolveComponents(join(fixturesDir, 'home.fud'), fixtureIo);

  it('is lang="es" without i18n, as it always was', () => {
    expect(emitPageModule(graph)).toContain('<html lang="es"><head>');
  });

  it('carries the locale of the graph', () => {
    expect(emitPageModule(graph, { i18n: i18nOf({}, 'en') })).toContain('<html lang="en"><head>');
  });

  it('and dir="rtl" for a locale written right to left', () => {
    expect(emitPageModule(graph, { i18n: i18nOf({}, 'ar', ['es', 'ar']) })).toContain('<html lang="ar" dir="rtl"><head>');
  });
});
