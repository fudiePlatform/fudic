/**
 * The pieces of `i18n.ts` one by one (SDD-58 §4.5–§4.10): ids and queries, patterns and
 * prefixes, the catalogs read, the negotiation of `/`, and what a nested pass compiles with.
 * The whole of it, end to end, is `i18n-build` and `i18n-serve`.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message, ResolveIo } from '@fudic/compiler';
import { messageKey } from '@fudic/i18n';
import type { RouteBuild } from '../src/discover.js';
import {
  Catalogs,
  LocaleIos,
  alternatesOf,
  catalogFile,
  chunkDir,
  compilesPerLocale,
  errorLocaleOf,
  errorPageFor,
  handedOn,
  hasQuery,
  localeOf,
  localeOfPath,
  localePlugin,
  localeTarget,
  localizeRoutes,
  negotiate,
  pageModuleOf,
  prefixPattern,
  resolveForLocale,
  rootRedirectHtml,
  withLocale,
  withoutLocale,
  withoutLocalePrefix,
  type LocaleContext,
} from '../src/i18n.js';

const route = (pattern: string, file = 'about.fud', locale?: string): RouteBuild =>
  ({
    route: { file, pattern, params: [] },
    absPath: 'C:\\app\\src\\routes\\about.fud',
    analysis: {},
    decision: {},
    ...(locale === undefined ? {} : { locale }),
  }) as unknown as RouteBuild;

describe('ids and queries', () => {
  it('localeOf reads the locale of an id, if any', () => {
    expect(localeOf('/a.fud?client&locale=en')).toBe('en');
    expect(localeOf('/a.fud?client')).toBeUndefined();
    expect(localeOf('/a.fud')).toBeUndefined();
  });

  it('withLocale adds it to whatever query there is', () => {
    expect(withLocale('/a.fud', 'en')).toBe('/a.fud?locale=en');
    expect(withLocale('/a.fud?client', 'en')).toBe('/a.fud?client&locale=en');
  });

  it('withoutLocale leaves the bare flags as they were written', () => {
    expect(withoutLocale('client&locale=en')).toBe('client');
    expect(withoutLocale('locale=en')).toBe('');
  });

  it('hasQuery sees the flag with or without a locale', () => {
    expect(hasQuery('/a.fud?client&locale=en', 'client')).toBe(true);
    expect(hasQuery('/a.fud?client', 'client')).toBe(true);
    expect(hasQuery('/a.fud?ioc', 'client')).toBe(false);
    expect(hasQuery('/a.fud', 'client')).toBe(false);
  });

  it('catalogFile is src/locales/<locale>.json', () => {
    expect(catalogFile('/app', 'en').replace(/\\/gu, '/')).toBe('/app/src/locales/en.json');
  });
});

describe('patterns and prefixes', () => {
  it('prefixPattern prefixes with two or more locales, `/` included', () => {
    expect(prefixPattern('/about', 'en', ['es', 'en'])).toBe('/en/about');
    expect(prefixPattern('/', 'en', ['es', 'en'])).toBe('/en');
    expect(prefixPattern('/about', 'es', ['es'])).toBe('/about');
  });

  it('localizeRoutes: one route per locale, or the routes as they were', () => {
    const routes = [route('/about')];
    expect(localizeRoutes(routes, undefined)).toEqual(routes);
    expect(localizeRoutes(routes, ['es', 'en']).map((r) => [r.locale, r.route.pattern])).toEqual([
      ['es', '/es/about'],
      ['en', '/en/about'],
    ]);
  });

  it('pageModuleOf: the page compiled for its locale', () => {
    expect(pageModuleOf(route('/about'))).toBe('C:/app/src/routes/about.fud');
    expect(pageModuleOf(route('/en/about', 'about.fud', 'en'))).toBe('C:/app/src/routes/about.fud?locale=en');
  });

  it('localeOfPath: the prefix with two or more, the only one with one, none without', () => {
    expect(localeOfPath('/en/about', ['es', 'en'])).toBe('en');
    expect(localeOfPath('/about', ['es', 'en'])).toBeUndefined();
    expect(localeOfPath('/about', ['es'])).toBe('es');
    expect(localeOfPath('/about', undefined)).toBeUndefined();
  });

  it('withoutLocalePrefix takes the prefix off, and leaves `/` for a bare one', () => {
    expect(withoutLocalePrefix('/en/_fudic/error/404', ['es', 'en'])).toBe('/_fudic/error/404');
    expect(withoutLocalePrefix('/en', ['es', 'en'])).toBe('/');
    expect(withoutLocalePrefix('/_fudic/error/404', ['es', 'en'])).toBe('/_fudic/error/404');
    expect(withoutLocalePrefix('/es/x', ['es'])).toBe('/es/x');
    expect(withoutLocalePrefix('/en/x', undefined)).toBe('/en/x');
  });

  it('chunkDir: a directory per locale only with two or more', () => {
    expect(chunkDir('en', ['es', 'en'])).toBe('en/');
    expect(chunkDir('es', ['es'])).toBe('');
    expect(chunkDir(undefined, ['es', 'en'])).toBe('');
    expect(chunkDir('en', undefined)).toBe('');
  });
});

describe('_error.fud and the alternates', () => {
  const pages = [route('/es/_fudic/error/:status', '_error.fud', 'es'), route('/en/_fudic/error/:status', '_error.fud', 'en')];

  it('errorPageFor: the locale’s own, else the first', () => {
    expect(errorPageFor(pages, 'en')).toBe(pages[1]);
    expect(errorPageFor(pages, undefined)).toBe(pages[0]);
    expect(errorPageFor([], 'en')).toBeUndefined();
  });

  it('errorLocaleOf: the URL’s prefix, else the page it comes from', () => {
    expect(errorLocaleOf('/en/_fudic/error/404', '/es/about', ['es', 'en'])).toBe('en');
    expect(errorLocaleOf('/_fudic/error/404', '/en/about', ['es', 'en'])).toBe('en');
    expect(errorLocaleOf('/_fudic/error/404', undefined, ['es', 'en'])).toBeUndefined();
  });

  it('alternatesOf: a route of two or more locales, never _error.fud', () => {
    expect(alternatesOf(route('/en/about', 'about.fud', 'en'), ['es', 'en'], '/')).toEqual({
      alternates: { locale: 'en', locales: ['es', 'en'], base: '/' },
    });
    expect(alternatesOf(route('/about'), ['es', 'en'], '/')).toEqual({});
    expect(alternatesOf(route('/en/about', 'about.fud', 'en'), undefined, '/')).toEqual({});
    expect(alternatesOf(route('/about', 'about.fud', 'es'), ['es'], '/')).toEqual({});
    expect(alternatesOf(pages[1]!, ['es', 'en'], '/')).toEqual({});
  });

  it('rootRedirectHtml: off to the first locale, with every alternate', () => {
    const html = rootRedirectHtml(['es', 'en'], '/app/');
    expect(html).toContain('<meta http-equiv="refresh" content="0; url=/app/es/">');
    expect(html).toContain('<link rel="alternate" hreflang="en" href="/app/en/">');
    expect(html).toContain('<link rel="alternate" hreflang="x-default" href="/app/">');
  });
});

describe('negotiate (§4.5)', () => {
  const locales = ['es', 'en-GB', 'pt'];

  it('the same tag first, by quality', () => {
    expect(negotiate('pt;q=0.5, en-GB;q=0.9', locales)).toBe('en-GB');
  });

  it('then the same base language', () => {
    expect(negotiate('en-US', locales)).toBe('en-GB');
  });

  it('in the order written when the quality ties, and never what q=0 refuses', () => {
    expect(negotiate('pt, es', locales)).toBe('pt');
    expect(negotiate('pt;q=0, fr', locales)).toBe('es');
  });

  it('a parameter that is not q does not count as one', () => {
    expect(negotiate('pt;level=1', locales)).toBe('pt');
  });

  it('the first locale when nothing fits, or there is no header', () => {
    expect(negotiate('fr, de', locales)).toBe('es');
    expect(negotiate(undefined, locales)).toBe('es');
    expect(negotiate(' , ', locales)).toBe('es');
  });
});

describe('catalogs, read and never written (§4.10)', () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-catalogs-'));
  mkdirSync(join(root, 'src', 'locales'), { recursive: true });
  const message = (source: string): Message =>
    ({ context: 'routes/about.fud', key: messageKey('routes/about.fud', source), source }) as unknown as Message;
  const write = (translations: Record<string, string>): void => {
    const entries = Object.fromEntries(
      Object.entries(translations).map(([source, translation], at) => [
        messageKey('routes/about.fud', source),
        { source, translation, where: 'src/routes/about.fud:1', at },
      ]),
    );
    writeFileSync(join(root, 'src', 'locales', 'en.json'), JSON.stringify({ 'routes/about.fud': entries }));
  };

  it('a valid translation compiles; missing, empty and invalid ones are the original text', () => {
    write({ Hola: 'Hello', Vacío: '', Roto: 'Broken {' });
    const compile = new Catalogs(root, ['es', 'en'], false).compileFor('en');
    expect(compile.locale).toBe('en');
    expect(compile.locales).toEqual(['es', 'en']);
    expect(compile.translate(message('Hola'))).toBeDefined();
    expect(compile.translate(message('Vacío'))).toBeUndefined();
    expect(compile.translate(message('Roto'))).toBeUndefined();
    expect(compile.translate(message('Nuevo'))).toBeUndefined();
    expect(compile.translate({ ...message('Hola'), context: 'app-card' })).toBeUndefined();
    expect(compile.relative?.(join(root, 'src', 'routes', 'about.fud'))).toBe('src/routes/about.fud');
  });

  it('a catalog that is not there is an empty one', () => {
    expect(new Catalogs(root, ['es', 'en'], false).of('fr')).toEqual({});
  });

  it('a build reads each once; dev, on every compile', () => {
    write({ Hola: 'Hello' });
    const build = new Catalogs(root, ['es', 'en'], false);
    const dev = new Catalogs(root, ['es', 'en'], true);
    const first = build.of('en');
    expect(dev.of('en')).toEqual(first);
    write({ Hola: 'Hi' });
    expect(build.of('en')).toBe(first);
    expect(dev.of('en')).not.toEqual(first);
  });
});

describe('LocaleIos', () => {
  const root = mkdtempSync(join(tmpdir(), 'fudic-locale-ios-'));
  const base = (): ResolveIo => ({ read: () => '<p>Hola</p>' }) as unknown as ResolveIo;

  it('a build keeps one io per locale and base; a new base starts over', () => {
    const ios = new LocaleIos(new Catalogs(root, ['es', 'en'], false), false);
    const one = base();
    const en = ios.for(one, 'en');
    expect(ios.for(one, 'en')).toBe(en);
    expect(ios.for(one, 'es')).not.toBe(en);
    expect(ios.for(base(), 'en')).not.toBe(en);
  });

  it('dev, a fresh one every time', () => {
    const ios = new LocaleIos(new Catalogs(root, ['es', 'en'], true), true);
    const one = base();
    expect(ios.for(one, 'en')).not.toBe(ios.for(one, 'en'));
    expect(ios.for(one, 'en').read('/x.fud')).toContain('Hola');
  });
});

describe('the propagation of the locale (§4.6)', () => {
  const root = 'C:/app';

  it('compilesPerLocale: every .fud, and the scripts of the project outside node_modules', () => {
    expect(compilesPerLocale('C:/lib/card.fud', root)).toBe(true);
    expect(compilesPerLocale('C:\\app\\src\\lib.ts', root)).toBe(true);
    expect(compilesPerLocale('C:/app/node_modules/x/index.js', root)).toBe(false);
    expect(compilesPerLocale('C:/elsewhere/index.js', root)).toBe(false);
    expect(compilesPerLocale('C:/app/src/data.json', root)).toBe(false);
  });

  const resolver =
    (answer: { id: string; external?: boolean | 'absolute' | 'relative' } | null) =>
    async () =>
      answer;

  const en = { importer: 'C:/app/src/a.fud?locale=en', locale: 'en' };

  it('hands the importer’s locale on to what compiles per locale', async () => {
    expect(await resolveForLocale(resolver({ id: 'C:/app/src/lib.ts' }), './lib', en, root)).toBe('C:/app/src/lib.ts?locale=en');
    expect(await resolveForLocale(resolver({ id: 'C:/app/b.fud?client' }), './b.fud', en, root)).toBe(
      'C:/app/b.fud?client&locale=en',
    );
  });

  it('and not to a compiled dependency, an external or nothing at all', async () => {
    const dep = { id: 'C:/app/node_modules/x/index.js' };
    expect(await resolveForLocale(resolver(dep), 'x', en, root)).toBe(dep);
    const external = { id: 'node:fs', external: true };
    expect(await resolveForLocale(resolver(external), 'node:fs', en, root)).toBe(external);
    const absolute = { id: '/x.js', external: 'absolute' as const };
    expect(await resolveForLocale(resolver(absolute), '/x.js', en, root)).toBe(absolute);
    expect(await resolveForLocale(resolver(null), 'nope', en, root)).toBeNull();
  });

  it('handedOn: an importer compiled for a locale, and an id that names none yet', () => {
    expect(handedOn('./lib', 'C:/app/a.fud?locale=en')).toEqual({ importer: 'C:/app/a.fud?locale=en', locale: 'en' });
    expect(handedOn('./lib', 'C:/app/a.fud')).toBeUndefined();
    expect(handedOn('./lib', undefined)).toBeUndefined();
    expect(handedOn('./b.fud?locale=es', 'C:/app/a.fud?locale=en')).toBeUndefined();
  });

});

describe('what a nested pass compiles with', () => {
  const io = { read: () => '' } as unknown as ResolveIo;
  const localized = { read: () => 'localized' } as unknown as ResolveIo;
  const ctx: LocaleContext = {
    root: 'C:/app',
    locales: ['es', 'en'],
    ioFor: () => localized,
    compileFor: (locale) => ({ locale, locales: ['es', 'en'], translate: () => undefined }),
  };

  it('localeTarget: for its locale when it names one', () => {
    const target = localeTarget(ctx, io, 'C:/app/a.fud?locale=en&server');
    expect(target).toMatchObject({ path: 'C:/app/a.fud', query: 'server', locale: 'en', io: localized });
    expect(target.i18n?.locale).toBe('en');
  });

  it('as before this SDD otherwise', () => {
    expect(localeTarget(ctx, io, 'C:/app/a.fud?server')).toEqual({ path: 'C:/app/a.fud', query: 'server', io });
    expect(localeTarget(ctx, io, 'C:/app/a.fud')).toEqual({ path: 'C:/app/a.fud', query: '', io });
    expect(localeTarget(undefined, io, 'C:/app/a.fud?locale=en')).toEqual({ path: 'C:/app/a.fud', query: 'locale=en', io });
  });

  it('localePlugin compiles an app script for its locale, and nothing else', async () => {
    const plugin = localePlugin(ctx);
    const transform = plugin.transform as (code: string, id: string) => { code: string } | null;
    const code = "import { locale } from '@fudic/i18n';\nexport const l = locale;\n";
    expect(transform(code, 'C:/app/src/x.ts?locale=en')?.code).toContain('export const l = (`en`);');
    expect(transform(code, 'C:/app/src/x.ts')).toBeNull();
    expect(transform(code, 'C:/app/src/x.css?locale=en')).toBeNull();

    const resolveId = plugin.resolveId as (this: unknown, id: string, importer?: string) => Promise<unknown>;
    const context = { resolve: async () => ({ id: 'C:/app/src/lib.ts' }) };
    expect(await resolveId.call(context, './lib', 'C:/app/src/a.ts?locale=en')).toBe('C:/app/src/lib.ts?locale=en');
    expect(await resolveId.call(context, './lib', 'C:/app/src/a.ts')).toBeNull();
  });
});
