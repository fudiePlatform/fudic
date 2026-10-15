/**
 * SDD-58 §4.11, criterion 33 — the hover over a message shows its text in every locale, and a
 * catalog that changes on disk changes the hover with no restart.
 */

import { describe, expect, it } from 'vitest';
import { messageKey } from '@fudic/i18n';
import { fudicDiagnostics } from '@fudic/typecheck';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { DocumentCache } from '../src/document-cache.js';
import { RequestStats } from '../src/stats.js';
import { createFudicService } from '../src/services/plugin.js';
import { MISSING, Translations, translationsMarkdown } from '../src/translations.js';
import { WorkspaceIndex } from '../src/workspace-index.js';
import { fakeServiceContext, TOKEN } from './_lsp.js';
import { memoryFs } from './_support.js';

const CARD = '/w/app/src/components/app-card.fud';
const SOURCE =
  '<app-card>\n  <template shadowrootmode="open">\n    <p>Cerrar</p>\n    <p>Hola <b title="Negrita">mundo</b></p>\n    <hr>\n  </template>\n</app-card>\n';

const entry = (source: string, translation?: string) => ({
  [messageKey('app-card', source)]: {
    source,
    ...(translation === undefined ? {} : { translation }),
    where: 'src/components/app-card.fud:3',
    at: 0,
  },
});

/** A workspace with one app at `/w/app` whose catalogs are the given texts. */
function workspace(files: Record<string, string> = {}): Record<string, string> {
  return {
    '/w/app/fudic.json': '{ "kind": "app", "locales": ["es", "en"] }',
    '/w/app/src/locales/es/components/app-card.json': JSON.stringify({ 'app-card': entry('Cerrar', 'Cerrar') }),
    '/w/app/src/locales/en/components/app-card.json': JSON.stringify({ 'app-card': entry('Cerrar', 'Close') }),
    [CARD]: SOURCE,
    ...files,
  };
}

const offsetOf = (needle: string, delta = 1): number => SOURCE.indexOf(needle) + delta;

describe('Translations', () => {
  it('gives the text of the message in every locale, in the configured order', () => {
    const found = new Translations(memoryFs(workspace())).at(CARD, SOURCE, offsetOf('Cerrar'));

    expect(found?.message.source).toBe('Cerrar');
    expect(found?.lines).toEqual([
      { locale: 'es', text: 'Cerrar' },
      { locale: 'en', text: 'Close' },
    ]);
    expect(translationsMarkdown(found!)).toBe('es: Cerrar  \nen: Close');
  });

  it('marks what is missing, empty or unreadable with a dash', () => {
    const files = workspace({
      '/w/app/src/locales/es/components/app-card.json': JSON.stringify({ 'app-card': entry('Cerrar', '') }),
      '/w/app/src/locales/en/components/app-card.json': '{ "app-card": ',
    });
    const found = new Translations(memoryFs(files)).at(CARD, SOURCE, offsetOf('Cerrar'));

    expect(translationsMarkdown(found!)).toBe(`es: ${MISSING}  \nen: ${MISSING}`);
  });

  it('reads a locale with no catalog file as missing', () => {
    const files = workspace();
    delete files['/w/app/src/locales/en/components/app-card.json'];
    const found = new Translations(memoryFs(files)).at(CARD, SOURCE, offsetOf('Cerrar'));

    expect(found?.lines[1]).toEqual({ locale: 'en', text: undefined });
  });

  it('prefers the innermost message, and escapes the markup of the message', () => {
    const translations = new Translations(memoryFs(workspace()));

    expect(translations.at(CARD, SOURCE, offsetOf('Negrita'))?.message.source).toBe('Negrita');
    const run = translations.at(CARD, SOURCE, offsetOf('Hola'));
    expect(run?.message.source).toBe('Hola <0>mundo</0>');
    expect(translationsMarkdown({ message: run!.message, lines: [{ locale: 'en', text: 'Hi <0>world</0>' }] })).toBe(
      'en: Hi \\<0\\>world\\</0\\>',
    );
  });

  it('says nothing away from a message, outside an app, or in an app without locales', () => {
    expect(new Translations(memoryFs(workspace())).at(CARD, SOURCE, offsetOf('<hr>'))).toBeUndefined();
    expect(new Translations(memoryFs({ [CARD]: SOURCE })).at(CARD, SOURCE, offsetOf('Cerrar'))).toBeUndefined();
    const plain = workspace({ '/w/app/fudic.json': '{ "kind": "app" }' });
    expect(new Translations(memoryFs(plain)).at(CARD, SOURCE, offsetOf('Cerrar'))).toBeUndefined();
  });

  it('reads a changed catalog after it is invalidated, and only then', () => {
    const files = workspace();
    const translations = new Translations(memoryFs(files));
    expect(translations.at(CARD, SOURCE, offsetOf('Cerrar'))?.lines[1]?.text).toBe('Close');

    files['/w/app/src/locales/en/components/app-card.json'] = JSON.stringify({ 'app-card': entry('Cerrar', 'Shut') });
    expect(translations.invalidate('/w/app/src/components/app-card.fud')).toBe(false);
    expect(translations.at(CARD, SOURCE, offsetOf('Cerrar'))?.lines[1]?.text).toBe('Close');

    expect(translations.invalidate('/w/app/src/locales/en/components/app-card.json')).toBe(true);
    expect(translations.at(CARD, SOURCE, offsetOf('Cerrar'))?.lines[1]?.text).toBe('Shut');

    files['/w/app/fudic.json'] = '{ "kind": "app", "locales": ["en"] }';
    expect(translations.invalidate('/w/app/fudic.json')).toBe(true);
    expect(translations.at(CARD, SOURCE, offsetOf('Cerrar'))?.lines.map((l) => l.locale)).toEqual(['en']);
  });

  it('extracts a file again when its text changes', () => {
    const translations = new Translations(memoryFs(workspace()));
    expect(translations.at(CARD, SOURCE, offsetOf('Cerrar'))?.message.source).toBe('Cerrar');

    const edited = SOURCE.replace('Cerrar', 'Abrir');
    expect(translations.at(CARD, edited, edited.indexOf('Abrir') + 1)?.message.source).toBe('Abrir');
  });
});

describe('the hover', () => {
  function hoverAt(offset: number, translations?: Translations) {
    const index = new WorkspaceIndex(memoryFs(workspace()));
    index.scan('/w');
    const cached = new DocumentCache(index).get(CARD, 1, SOURCE);
    const document = TextDocument.create(URI.file(CARD).toString(), 'fud', 1, SOURCE);
    const context = fakeServiceContext({ [URI.file(CARD).toString()]: cached }, () => undefined, {});
    const service = createFudicService({
      index,
      stats: new RequestStats(),
      ...(translations === undefined ? {} : { translations }),
    }).create(context);
    return { document, hover: service.provideHover?.(document, document.positionAt(offset), TOKEN) };
  }

  it('shows the translations over a message, on its span', async () => {
    const { document, hover } = hoverAt(offsetOf('Cerrar'), new Translations(memoryFs(workspace())));
    const answer = await hover;

    expect(answer?.contents).toEqual({ kind: 'markdown', value: 'es: Cerrar  \nen: Close' });
    expect(answer?.range).toEqual({
      start: document.positionAt(SOURCE.indexOf('Cerrar')),
      end: document.positionAt(SOURCE.indexOf('Cerrar') + 'Cerrar'.length),
    });
  });

  it('says nothing over a message when the server has no catalogs', async () => {
    expect(await hoverAt(offsetOf('Cerrar')).hover).toBeUndefined();
  });
});

describe('the diagnostics of a .fud', () => {
  it('never carry the command’s FUD1022–FUD1025', () => {
    // Two `t()` with the same text and different hole keys: FUD1025 for `fudic translate`.
    const source =
      "@code { import { t } from '@fudic/i18n'; }\n<app-card>\n  <template shadowrootmode=\"open\">\n    <p>@t(\"Hola {a}\", { a: 1 }) @t(\"Hola {a}\", { a: 1, b: 2 })</p>\n  </template>\n</app-card>\n";
    const index = new WorkspaceIndex(memoryFs(workspace({ [CARD]: source })));
    index.scan('/w');
    const codes = fudicDiagnostics(new DocumentCache(index).get(CARD, 1, source), index).map((d) => d.code);

    expect(codes.filter((code) => /^FUD102[2-5]$/u.test(code))).toEqual([]);
  });
});
