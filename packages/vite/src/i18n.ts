/**
 * Translations in the build (SDD-58 §3.4, §4.5–§4.10): one module graph per locale inside one
 * build, the route table expanded to one literal pattern per locale, and the catalogs READ.
 *
 * The pipeline never writes a catalog, never extracts and never reports about one: a message
 * that is missing, a translation that is invalid and a catalog that cannot be read all compile
 * with the original text, silently (§4.10). `fudic translate` is the one that speaks.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';
import { localizedIo, translateScript, type LocaleCompile, type ResolveIo } from '@fudic/compiler';
import { compileMessage, parseCatalog, type Catalog } from '@fudic/i18n';
import { buildIo } from './build-memory.js';
import { ERROR_FILE, LOCALES_DIR } from '@fudic/conventions';
import type { RouteBuild } from './discover.js';

/** The query parameter that names the locale a module is compiled for: `x.fud?locale=en`. */
export const LOCALE_PARAM = 'locale';

/** The catalog of `locale`: `src/locales/<locale>.json`. */
export function catalogFile(root: string, locale: string): string {
  return join(root, LOCALES_DIR, `${locale}.json`);
}

/** The locale a module id is compiled for, or `undefined` for one compiled for none. */
export function localeOf(id: string): string | undefined {
  const q = id.indexOf('?');
  return q === -1 ? undefined : (new URLSearchParams(id.slice(q + 1)).get(LOCALE_PARAM) ?? undefined);
}

/**
 * The file names of the chunks of a pass that compiles every locale in ONE build (§4.6): a
 * chunk of a locale's graph carries its prefix, `en-_layout-[hash].js`. Without it the layout
 * of `es` and that of `en` are two chunks of one name, the build id cannot replace the hash
 * of either (FUD0501), and the URL the manifest derives for them points at no file.
 */
export function localeChunkFileNames(dir: string): (chunk: { readonly moduleIds: readonly string[] }) => string {
  return (chunk) => {
    const locale = chunk.moduleIds.map(localeOf).find((l) => l !== undefined);
    return `${dir}/${locale === undefined ? '' : `${locale}-`}[name]-[hash].js`;
  };
}

/** `id` compiled for `locale`: the parameter added to whatever query it already has. */
export function withLocale(id: string, locale: string): string {
  return `${id}${id.includes('?') ? '&' : '?'}${LOCALE_PARAM}=${locale}`;
}

/** `id` without its locale: `x.fud?client&locale=en` → `x.fud?client`. */
export function idWithoutLocale(id: string): string {
  const q = id.indexOf('?');
  if (q === -1) return id;
  const rest = withoutLocale(id.slice(q + 1));
  return rest === '' ? id.slice(0, q) : `${id.slice(0, q)}?${rest}`;
}

/** A query without its locale: what the rest of the plugin dispatches on (`client`, `server`). */
export function withoutLocale(query: string): string {
  const params = new URLSearchParams(query);
  params.delete(LOCALE_PARAM);
  // `client`, `server`, `ioc` are bare flags: `URLSearchParams` would write them as `client=`.
  return [...params.keys()].join('&');
}

/**
 * Whether `id` is `<path>?<flag>`, compiled for a locale or not: `x.fud?client&locale=en` is a
 * client chunk as much as `x.fud?client` is.
 */
export function hasQuery(id: string, flag: string): boolean {
  const q = id.indexOf('?');
  return q !== -1 && withoutLocale(id.slice(q + 1)) === flag;
}

/** `/about` in `en` with two or more locales: `/en/about`; `/` is `/en`. One locale: as it is. */
export function prefixPattern(pattern: string, locale: string, locales: readonly string[]): string {
  if (locales.length < 2) return pattern;
  return pattern === '/' ? `/${locale}` : `/${locale}${pattern}`;
}

/**
 * Every route once per locale (§4.5). Literal patterns, not a `:locale` parameter, so they never
 * collide with the author's own. Route-major, so a route's locales stay together in the table.
 */
export function localizeRoutes(builds: readonly RouteBuild[], locales: readonly string[] | undefined): RouteBuild[] {
  if (locales === undefined) return [...builds];
  return builds.flatMap((rb) =>
    locales.map((locale) => ({
      ...rb,
      locale,
      route: { ...rb.route, pattern: prefixPattern(rb.route.pattern, locale, locales) },
    })),
  );
}

/** The id the render wrapper of a route imports its page under: compiled for its locale. */
export function pageModuleOf(rb: RouteBuild): string {
  const path = rb.absPath.replace(/\\/gu, '/');
  return rb.locale === undefined ? path : withLocale(path, rb.locale);
}

/**
 * The locale a URL is in: the one its first segment names (`/en/about` → `en`) with two or more
 * locales, the only one with one, and none for an app without `locales` or a URL with no prefix.
 */
export function localeOfPath(pathname: string, locales: readonly string[] | undefined): string | undefined {
  if (locales === undefined || locales.length < 2) return locales?.[0];
  const first = pathname.split('/')[1];
  return locales.find((l) => l === first);
}

/**
 * The locale `_error.fud` is asked in at `pathname` (§4.5): its prefix's
 * (`/en/_fudic/error/404`), else that of the page the browser comes from — `errorPages` sends a
 * failed call to `/_fudic/error/404`, which has none — else none. `refererPath` is that page's
 * path, base already stripped.
 */
export function errorLocaleOf(
  pathname: string,
  refererPath: string | undefined,
  locales: readonly string[] | undefined,
): string | undefined {
  return localeOfPath(pathname, locales) ?? (refererPath === undefined ? undefined : localeOfPath(refererPath, locales));
}

/** `pathname` without the locale prefix it opens with: `/en/_fudic/error/404` → `/_fudic/error/404`. */
export function withoutLocalePrefix(pathname: string, locales: readonly string[] | undefined): string {
  const locale = locales === undefined || locales.length < 2 ? undefined : localeOfPath(pathname, locales);
  return locale === undefined ? pathname : pathname.slice(locale.length + 1) || '/';
}

/**
 * The `_error.fud` a failure in `locale` is painted with (§4.5): that locale's, and the first
 * one's for a request in none — `/_fudic/error/404` with no page behind it.
 */
export function errorPageFor(pages: readonly RouteBuild[], locale: string | undefined): RouteBuild | undefined {
  return pages.find((p) => p.locale === locale) ?? pages[0];
}

/** What a route's wrapper is told to write about the other locales (§4.7). */
export interface Alternates {
  readonly locale: string;
  readonly locales: readonly string[];
  readonly base: string;
  /**
   * The origin of every URL written, from `fudic.json`'s `site`. Absent in dev, where each
   * request's own origin is the right one.
   */
  readonly site?: string;
}

/**
 * The alternates of a route with two or more locales (§4.7). Not `_error.fud`'s: it answers at
 * every URL, and none of them is the same page in another language.
 */
export function alternatesOf(
  rb: RouteBuild,
  locales: readonly string[] | undefined,
  base: string,
  site?: string,
): { readonly alternates?: Alternates } {
  return rb.locale === undefined || locales === undefined || locales.length < 2 || rb.route.file === ERROR_FILE
    ? {}
    : { alternates: { locale: rb.locale, locales, base, ...(site === undefined ? {} : { site }) } };
}

/**
 * Where the client chunks of a locale live under `assets/h/`: `en/` with two or more locales,
 * nothing with one — a single-locale app keeps the `dist` it had (§4.5).
 */
export function chunkDir(locale: string | undefined, locales: readonly string[] | undefined): string {
  return locale === undefined || locales === undefined || locales.length < 2 ? '' : `${locale}/`;
}

/**
 * The catalogs, read. `fresh` re-reads on every compile — dev, where a save must be seen
 * without a restart (§4.10) — and a build reads each one once.
 */
export class Catalogs {
  readonly #read = new Map<string, Catalog>();

  constructor(
    private readonly root: string,
    readonly locales: readonly string[],
    private readonly fresh: boolean,
  ) {}

  /** The catalog of `locale`; empty when it is not there or cannot be read. */
  of(locale: string): Catalog {
    const known = this.fresh ? undefined : this.#read.get(locale);
    if (known !== undefined) return known;
    const file = catalogFile(this.root, locale);
    const catalog = existsSync(file) ? parseCatalog(readFileSync(file, 'utf8'), file).value : {};
    this.#read.set(locale, catalog);
    return catalog;
  }

  /** How a module is compiled for `locale`: its catalog's translations, or the original text. */
  compileFor(locale: string): LocaleCompile {
    const catalog = this.of(locale);
    return {
      locale,
      locales: this.locales,
      relative: (path) => relative(this.root, path).replace(/\\/gu, '/'),
      translate: (message) => {
        const entry = Object.hasOwn(catalog, message.context) ? catalog[message.context]![message.key] : undefined;
        // An empty translation is one nobody wrote yet (criterion 31): the original text.
        if (entry?.translation === undefined || entry.translation === '') return undefined;
        const compiled = compileMessage(entry.translation, locale);
        return compiled.diagnostics.length === 0 ? compiled.value : undefined;
      },
    };
  }
}

/**
 * The io a locale's graph reads through: every `.fud` rewritten for it. In a build, one per
 * locale with a memory of its own — the base memory is keyed by path, and `es` and `en` compile
 * the same path into two modules. In dev, a fresh one per call, since files and catalogs change
 * between two requests.
 */
export class LocaleIos {
  readonly #ios = new Map<string, ResolveIo>();
  #base: ResolveIo | undefined;

  constructor(private readonly catalogs: Catalogs, private readonly fresh: boolean) {}

  for(base: ResolveIo, locale: string): ResolveIo {
    if (this.fresh) return localizedIo(base, this.catalogs.compileFor(locale));
    if (this.#base !== base) {
      this.#ios.clear();
      this.#base = base;
    }
    let io = this.#ios.get(locale);
    if (io === undefined) {
      io = buildIo(localizedIo(base, this.catalogs.compileFor(locale)));
      this.#ios.set(locale, io);
    }
    return io;
  }
}

/** Whether an import resolved to a file this project compiles per locale (§4.6). */
export function compilesPerLocale(path: string, root: string): boolean {
  const posix = path.replace(/\\/gu, '/');
  if (posix.endsWith('.fud')) return true;
  if (!/\.[cm]?[jt]sx?$/u.test(posix) || posix.includes('/node_modules/')) return false;
  return posix.startsWith(`${root.replace(/\\/gu, '/').replace(/\/$/u, '')}/`);
}

/**
 * The locale of the `Accept-Language` header that best fits `locales` (§4.5): the same tag,
 * else the same base language, else the first of the list.
 */
export function negotiate(header: string | undefined, locales: readonly string[]): string {
  const wanted = (header ?? '')
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';') as [string, ...string[]];
      const q = params.map((p) => /^\s*q=([\d.]+)/u.exec(p)?.[1]).find((v) => v !== undefined);
      return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q), i };
    })
    .filter((w) => w.tag !== '' && w.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i);
  const lower = locales.map((l) => l.toLowerCase());
  for (const w of wanted) {
    const exact = lower.indexOf(w.tag);
    if (exact !== -1) return locales[exact]!;
    const base = w.tag.split('-')[0]!;
    const same = lower.findIndex((l) => l.split('-')[0] === base);
    if (same !== -1) return locales[same]!;
  }
  return locales[0]!;
}

/**
 * Where a request with no locale prefix is sent (§4.5), relative to `base`: `/` and every page
 * of the app asked without its prefix go to the same page in the language that fits
 * `Accept-Language`. That URL is the page's `x-default`. `false` for everything else — a URL
 * with a prefix decides by itself, and a file or the framework's own URLs are not pages.
 */
export function localeRedirect(
  pathname: string,
  acceptLanguage: string | undefined,
  locales: readonly string[] | undefined,
  isPage: (pathname: string) => boolean,
): string | false {
  if (locales === undefined || locales.length < 2 || localeOfPath(pathname, locales) !== undefined) return false;
  if (pathname !== '/') {
    if (pathname.startsWith('/_fudic/') || pathname.startsWith('/@') || /\.[^/]*$/u.test(pathname)) return false;
    if (!isPage(`/${locales[0]!}${pathname}`)) return false;
  }
  return `${negotiate(acceptLanguage, locales)}${pathname}`;
}

/** A page of a static build, once per path without its prefix, and the locales it exists in. */
export interface UnprefixedPage {
  /** `blog/hola/index.html`; `index.html` for `/`. */
  readonly fileName: string;
  /** The path without the prefix and without slashes around it: `blog/hola`, `''` for `/`. */
  readonly rest: string;
  /** The locales it was prerendered in, in configured order. */
  readonly locales: readonly string[];
}

/**
 * The pages of a static build without their prefix (§4.5): the `x-default` of each one. `/` is
 * always one, even in an app with no page of its own there: it is where a browser lands with no
 * language in the URL.
 */
export function unprefixedPages(files: Iterable<string>, locales: readonly string[]): UnprefixedPage[] {
  const byRest = new Map<string, Set<string>>();
  const prefixed = [...files];
  if (!prefixed.some((file) => locales.some((l) => file === `${l}/index.html`))) byRest.set('', new Set(locales));
  for (const file of prefixed) {
    const match = /^([^/]+)\/(.*)index\.html$/u.exec(file);
    if (match === null || !locales.includes(match[1]!) || match[2]!.startsWith('_fudic/')) continue;
    const rest = match[2]!.replace(/\/$/u, '');
    byRest.set(rest, (byRest.get(rest) ?? new Set()).add(match[1]!));
  }
  return [...byRest].map(([rest, found]) => ({
    fileName: rest === '' ? 'index.html' : `${rest}/index.html`,
    rest,
    locales: locales.filter((l) => found.has(l)),
  }));
}

/**
 * The page a static host serves at a path without a prefix (§4.5): it cannot negotiate, so it
 * sends the browser to the first locale the page exists in, and tells a search engine about
 * every version — with absolute URLs on `site`, itself as `x-default`.
 */
export function redirectHtml(page: UnprefixedPage, base: string, site: string | undefined): string {
  const at = `${site ?? ''}${base}`;
  const path = (l: string): string => (page.rest === '' ? `${l}/` : `${l}/${page.rest}`);
  const first = `${base}${path(page.locales[0]!)}`;
  const alternates = page.locales
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${at}${path(l)}">`)
    .join('');
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="refresh" content="0; url=${first}">` +
    `${alternates}<link rel="alternate" hreflang="x-default" href="${at}${page.rest}">` +
    `</head><body><a href="${first}">${first}</a></body></html>\n`
  );
}

/** What a nested pass needs to compile one locale's graph like the host does. */
export interface LocaleContext {
  readonly root: string;
  readonly locales: readonly string[];
  /** `fudic.json`'s `site`: the origin of the absolute URLs of the head (§4.7). */
  readonly site?: string;
  ioFor(base: ResolveIo, locale: string): ResolveIo;
  compileFor(locale: string): LocaleCompile;
}

/** A module id of a nested pass, taken apart the way its compile needs it. */
export interface LocaleTarget {
  readonly path: string;
  /** The query without the locale: what the pass dispatches on (`server`). */
  readonly query: string;
  readonly locale?: string;
  /** The io its `.fud` are read through: already translated for its locale. */
  readonly io: ResolveIo;
  /** What the emit adds on its own for the locale (`lang`, `dir`), when it has one. */
  readonly i18n?: LocaleCompile;
}

/**
 * `id` as a nested pass compiles it: for its locale when it names one and the build has
 * locales, else exactly as before this SDD.
 */
export function localeTarget(ctx: LocaleContext | undefined, io: ResolveIo, id: string): LocaleTarget {
  const q = id.indexOf('?');
  const path = q === -1 ? id : id.slice(0, q);
  const query = q === -1 ? '' : id.slice(q + 1);
  const locale = localeOf(id);
  if (ctx === undefined || locale === undefined) return { path, query, io };
  return { path, query: withoutLocale(query), locale, io: ctx.ioFor(io, locale), i18n: ctx.compileFor(locale) };
}

/** The host's `this.resolve`, as much of it as the propagation needs. */
type Resolve = (
  id: string,
  importer: string,
  options: { readonly skipSelf: boolean },
) => Promise<{ readonly id: string; readonly external?: boolean | 'absolute' | 'relative' } | null>;

/** An import that hands a locale on: its importer, and the locale it is compiled for. */
export interface HandedOn {
  readonly importer: string;
  readonly locale: string;
}

/**
 * Whether `id` imported by `importer` is resolved for a locale (§4.6): the importer is compiled
 * for one and the id names none yet. Synchronous, so a hook that has nothing to hand on answers
 * the way it always did.
 */
export function handedOn(id: string, importer: string | undefined): HandedOn | undefined {
  if (importer === undefined || localeOf(id) !== undefined) return undefined;
  const locale = localeOf(importer);
  return locale === undefined ? undefined : { importer, locale };
}

/**
 * Resolve `id` for the locale its importer hands on (§4.6): with the suffix when it is a module
 * this project compiles per locale, as resolved otherwise.
 */
export async function resolveForLocale(
  resolve: Resolve,
  id: string,
  { importer, locale }: HandedOn,
  root: string,
): Promise<string | { readonly id: string } | null> {
  const resolved = await resolve(id, importer, { skipSelf: true });
  if (resolved === null || resolved.external === true || resolved.external === 'absolute') return resolved;
  const q = resolved.id.indexOf('?');
  const path = q === -1 ? resolved.id : resolved.id.slice(0, q);
  return compilesPerLocale(path, root) ? withLocale(resolved.id, locale) : resolved;
}

/**
 * The plugin a nested build (the Service Worker's link pass, the edge pass) runs first: the
 * locale handed on through imports, and a `.ts`/`.js` of the app compiled for it.
 */
export function localePlugin(ctx: LocaleContext): Plugin {
  return {
    name: 'fudic:locale',
    enforce: 'pre',
    resolveId(id, importer) {
      const handed = handedOn(id, importer);
      return handed === undefined ? null : resolveForLocale((i, from, o) => this.resolve(i, from, o), id, handed, ctx.root);
    },
    transform(code, id) {
      const locale = localeOf(id);
      if (locale === undefined) return null;
      // A `.fud` is the host plugin's to compile; here only an app's `.ts`/`.js`.
      const path = id.slice(0, id.indexOf('?'));
      if (!/\.[cm]?[jt]sx?$/u.test(path)) return null;
      const out = translateScript(code, path, ctx.compileFor(locale)).value;
      return { code: out.code, map: JSON.stringify(out.map) };
    },
  };
}
