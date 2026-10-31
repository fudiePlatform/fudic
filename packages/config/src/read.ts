/**
 * `fudic.json` — what a project declares about ITSELF (SDD-41 §3.1): its identity, the
 * prefix it proposes for new components, and whether it is an app or a library.
 *
 * **A directory is a fudic project if it has one.** That is the whole discovery rule.
 *
 * This reader is the twin of `readSwConfig`: I/O is injected so it is testable without a
 * filesystem, and it **never throws** — an unreadable file is a diagnostic and a project
 * with no configuration, never an exception. A project without the file behaves exactly
 * as it did before this SDD, which is what lets the file arrive without a migration.
 *
 * The two files do not merge, and §4.6 says why: this one talks about the PROJECT, and
 * `sw.json` talks about a DEPLOYMENT. They coincide one to one only while there is a
 * single app on an origin.
 */

import { CONFIG_FILE, ID_PATTERN, PREFIX_PATTERN, STYLE_NAME_PATTERN } from './constants.js';
import { API_DIR, BROWSER_DIR, SERVER_DIR } from '@fudic/conventions';
import { FUD0725, type FUD0725Problem, type FileDiagnostic, type Span } from '@fudic/diagnostics';

/** What the file declares, with every default already filled. */
export interface ProjectConfig {
  /** `''` when the file declares none — legal unless the project has a Service Worker. */
  readonly id: string;
  readonly kind: 'app' | 'lib';
  /**
   * What the CLI and the editor PROPOSE when creating a component. `''` when the file
   * declares none, and then both fall back to what they do today.
   *
   * It constrains nothing: a project with `prefix: "app"` can define `signal-counter`,
   * and that is a choice, not a mistake (§4.4).
   */
  readonly prefix: string;
  /**
   * The stylesheets this project adopts into the shadow root of EVERY one of its own
   * components, by name. In adoption order; `[]` when the file declares none.
   *
   * The order is contract, not a detail: it is the cascade. These go in front of everything
   * a component adopts, so the guide defines and the component adjusts.
   */
  readonly globalStyles: readonly NamedStyle[];
  /**
   * The stylesheets a component of this project MAY adopt: it names them in the
   * `shadowrootadoptedstylesheets` of its root `<template>`, in the order it wants them,
   * after the global ones and before its own `<style>`.
   */
  readonly styles: readonly NamedStyle[];
  /**
   * The languages of the app (SDD-58), canonical BCP 47, the first one the language the code
   * is written in. ABSENT when the file declares none: no extraction, no catalogs, no prefixes,
   * and the framework behaves byte for byte as it did before translations existed.
   */
  readonly locales?: readonly string[];
  /**
   * The origin the app is published at (SDD-58), like `https://example.com`, without a trailing
   * slash. What the build writes into the absolute URLs of `canonical` and `hreflang`, which
   * a page written without a request has no other way to know. Absent when the file declares none.
   */
  readonly site?: string;
  /**
   * Where the implementations that run only on the server live (SDD-60 §3.15), relative to the
   * project and inside it. `src/server` when the file declares none.
   */
  readonly server: string;
  /** Where the implementations that run in the browser live. `src/browser` when it declares none. */
  readonly browser: string;
  /** A library's `.fudapi` folder: present only for `kind: lib`, `fudapi` when it declares none. */
  readonly api?: string;
  /**
   * Whether the build writes each route's early hints into the route manifest and the Node server
   * sends them (SDD-70 §3.10). `true` when the file declares none.
   */
  readonly earlyHints: boolean;
  /**
   * Where the sheets the components adopt live (SDD-70 §3.10): `inline`, a style module in the
   * page, or `link`, a file per sheet. `inline` when the file declares none.
   */
  readonly componentStyles: 'inline' | 'link';
}

/** One `"name": "path"` entry of `globalStyles` or `styles`. */
export interface NamedStyle {
  /** The name the author gave it — also its module-map specifier. */
  readonly name: string;
  /** The path as written, relative to the project root. */
  readonly path: string;
}

export interface ConfigResult {
  /** `null` when there is no `fudic.json`, or it is unusable. Degrades; never throws. */
  readonly config: ProjectConfig | null;
  readonly diagnostics: readonly FileDiagnostic[];
}

/** Minimal I/O seam, identical in shape to SDD-20's `ConfigIo`. */
export interface ConfigIo {
  exists(path: string): boolean;
  read(path: string): string;
}

/** What a field validator needs: the text to point into, and where to leave its verdict. */
interface Ctx {
  readonly text: string;
  readonly diagnostics: FileDiagnostic[];
}

/** Read `<root>/fudic.json`. */
export function readProjectConfig(root: string, io: ConfigIo): ConfigResult {
  const path = `${root}/${CONFIG_FILE}`;
  if (!io.exists(path)) {
    // Not having one is legal, and says nothing: zero diagnostics, not an informative one.
    return { config: null, diagnostics: [] };
  }

  let text: string;
  try {
    text = io.read(path);
  } catch (error) {
    return { config: null, diagnostics: [malformed({ problem: 'unreadable', reason: reason(error) })] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { config: null, diagnostics: [malformed({ problem: 'not-json', reason: reason(error) })] };
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { config: null, diagnostics: [malformed({ problem: 'not-object' })] };
  }

  const fields = parsed as Record<string, unknown>;
  const ctx: Ctx = { text, diagnostics: [] };

  const id = readString(fields, 'id', ID_PATTERN, 'lowercase, may contain hyphens', ctx);
  const kind = readKind(fields, ctx);
  const prefix = readString(
    fields,
    'prefix',
    PREFIX_PATTERN,
    'no hyphen — the hyphen is the one thing `tagOf` adds',
    ctx,
  );

  const globalStyles = readStyleMap(fields, 'globalStyles', ctx);
  const styles = readStyleMap(fields, 'styles', ctx);
  const locales = readLocales(fields, ctx);
  const site = readSite(fields, ctx);
  const server = readFolder(fields, 'server', SERVER_DIR, ctx);
  const browser = readFolder(fields, 'browser', BROWSER_DIR, ctx);
  const api = kind === 'lib' ? readFolder(fields, 'api', API_DIR, ctx) : undefined;
  const earlyHints = readEarlyHints(fields, ctx);
  const componentStyles = readComponentStyles(fields, ctx);

  // Fields are NOT rescued one by one (§4.2). Identity is a unit, and half an identity is
  // worse than none: an `id` that got through alone would namespace caches under a name
  // the next build, with the file fixed, would not use.
  if (ctx.diagnostics.length > 0) {
    return { config: null, diagnostics: ctx.diagnostics };
  }
  return {
    config: {
      id,
      kind,
      prefix,
      globalStyles,
      styles,
      ...(locales === undefined ? {} : { locales }),
      ...(site === undefined ? {} : { site }),
      server,
      browser,
      ...(api === undefined ? {} : { api }),
      earlyHints,
      componentStyles,
    },
    diagnostics: [],
  };
}

/**
 * A folder of the project (SDD-60 §3.15): absent is the convention; present, a relative path
 * that stays inside the project, kept without `./` or a trailing slash.
 */
function readFolder(fields: Record<string, unknown>, field: string, fallback: string, ctx: Ctx): string {
  const value = fields[field];
  if (value === undefined) {
    return fallback;
  }
  const refuse = (reason: string): string => {
    ctx.diagnostics.push(malformed({ problem: 'folder', field, reason }, fieldSpan(ctx.text, field)));
    return fallback;
  };
  if (typeof value !== 'string' || value.trim() === '') {
    return refuse(`${JSON.stringify(value)} is not a path`);
  }
  const path = value.replace(/\\/gu, '/');
  if (path.startsWith('/') || /^[A-Za-z]:/u.test(path)) {
    return refuse('it is absolute');
  }
  const segments = path.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.length === 0 || segments.includes('..')) {
    return refuse('it leaves the project');
  }
  return segments.join('/');
}

/**
 * An absent `locales` stays absent; a present one is a non-empty array of distinct BCP 47
 * tags, each canonicalized by `Intl.getCanonicalLocales` — so `"EN-us"` is read as `"en-US"`,
 * and two spellings of one tag are a repetition. Empty is refused rather than read as "no
 * languages": writing the key says the app has some, and the file should say which.
 */
function readLocales(fields: Record<string, unknown>, ctx: Ctx): readonly string[] | undefined {
  const value = fields['locales'];
  if (value === undefined) {
    return undefined;
  }
  const refuse = (reason: string): undefined => {
    ctx.diagnostics.push(malformed({ problem: 'locales', reason }, fieldSpan(ctx.text, 'locales')));
    return undefined;
  };
  if (!Array.isArray(value)) {
    return refuse('it is not an array');
  }
  if (value.length === 0) {
    return refuse('it is empty');
  }
  const locales: string[] = [];
  for (const tag of value as unknown[]) {
    const canonical = canonicalLocale(tag);
    if (canonical === undefined) {
      return refuse(`${JSON.stringify(tag)} is not a BCP 47 tag`);
    }
    if (locales.includes(canonical)) {
      return refuse(`"${canonical}" is repeated`);
    }
    locales.push(canonical);
  }
  return locales;
}

/**
 * An absent `site` stays absent; a present one is the origin of an http(s) URL, kept as
 * `URL.origin` writes it — lowercase host, no default port, no trailing slash.
 */
function readSite(fields: Record<string, unknown>, ctx: Ctx): string | undefined {
  const value = fields['site'];
  if (value === undefined) {
    return undefined;
  }
  const refuse = (reason: string): undefined => {
    ctx.diagnostics.push(malformed({ problem: 'site', reason }, fieldSpan(ctx.text, 'site')));
    return undefined;
  };
  if (typeof value !== 'string' || !URL.canParse(value)) {
    return refuse(`${JSON.stringify(value)} is not a URL`);
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return refuse(`"${url.protocol}" is not http or https`);
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return refuse("it has a path, a query or a fragment — the base path is Vite's `base`");
  }
  return url.origin;
}

/** The canonical form of a BCP 47 tag, or `undefined` when `tag` is not one. */
function canonicalLocale(tag: unknown): string | undefined {
  if (typeof tag !== 'string') {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(tag)[0];
  } catch {
    return undefined;
  }
}

/**
 * An absent map is `[]`; a present one is an object of `"name": "path"`, in written order.
 *
 * The paths are not validated here: what a path means needs a filesystem, and this reader has
 * none beyond the one file it was given. Whether the file exists (`FUD0740`) and whether two
 * names collide across the two maps (`FUD0741`) is `readProjectStyles`, which is handed an
 * `io`. An ARRAY is refused with the way out spelled: it is the shape `styles` had when every
 * sheet went to every component, and reading it as anything would change a project's looks
 * without a word.
 */
function readStyleMap(
  fields: Record<string, unknown>,
  field: string,
  ctx: Ctx,
): readonly NamedStyle[] {
  const value = fields[field];
  if (value === undefined) {
    return [];
  }
  const span = fieldSpan(ctx.text, field);
  if (Array.isArray(value)) {
    ctx.diagnostics.push(malformed({ problem: 'style-array', field }, span));
    return [];
  }
  if (value === null || typeof value !== 'object') {
    ctx.diagnostics.push(malformed({ problem: 'style-not-object', field }, span));
    return [];
  }
  const entries: NamedStyle[] = [];
  for (const [name, path] of Object.entries(value)) {
    if (!STYLE_NAME_PATTERN.test(name) || typeof path !== 'string') {
      ctx.diagnostics.push(
        malformed({ problem: 'style-entry', field, name, pattern: STYLE_NAME_PATTERN.source }, span),
      );
      continue;
    }
    entries.push({ name, path });
  }
  return entries;
}

/** An absent field is its default; a present one has to be a string of the right shape. */
function readString(
  fields: Record<string, unknown>,
  field: string,
  pattern: RegExp,
  note: string,
  ctx: Ctx,
): string {
  const value = fields[field];
  if (value === undefined) {
    return '';
  }
  if (typeof value !== 'string' || !pattern.test(value)) {
    ctx.diagnostics.push(
      malformed({ problem: 'string-field', field, pattern: pattern.source, note }, fieldSpan(ctx.text, field)),
    );
    return '';
  }
  return value;
}

/** `earlyHints` absent is `true`: the hints cost the page nothing, and a client that does not
 * understand a 103 ignores it (SDD-70 §3.10). */
function readEarlyHints(fields: Record<string, unknown>, ctx: Ctx): boolean {
  const value = fields['earlyHints'];
  if (value === undefined) return true;
  if (typeof value !== 'boolean') {
    ctx.diagnostics.push(malformed({ problem: 'early-hints' }, fieldSpan(ctx.text, 'earlyHints')));
    return true;
  }
  return value;
}

/** `componentStyles` absent is `inline`, what every page did before SDD-70 §3.10. */
function readComponentStyles(fields: Record<string, unknown>, ctx: Ctx): 'inline' | 'link' {
  const value = fields['componentStyles'];
  if (value === undefined) return 'inline';
  if (value !== 'inline' && value !== 'link') {
    ctx.diagnostics.push(malformed({ problem: 'component-styles' }, fieldSpan(ctx.text, 'componentStyles')));
    return 'inline';
  }
  return value;
}

/** `kind` absent is `'app'`: one app is the shape every project had before this SDD. */
function readKind(fields: Record<string, unknown>, ctx: Ctx): 'app' | 'lib' {
  const value = fields['kind'];
  if (value === undefined) {
    return 'app';
  }
  if (value !== 'app' && value !== 'lib') {
    ctx.diagnostics.push(malformed({ problem: 'kind' }, fieldSpan(ctx.text, 'kind')));
    return 'app';
  }
  return value;
}

/**
 * Where `"<field>"` is used as a KEY, so the editor underlines the field and not the file.
 *
 * The first occurrence of the text is not necessarily the key — `{"prefix":"id","id":42}`
 * spells `"id"` as a value first — so what settles it is the colon behind it. Absent when
 * the key is not in the text as written, which a key spelled with escapes manages.
 */
function fieldSpan(text: string, field: string): Span | undefined {
  const key = `"${field}"`;
  let from = 0;
  for (;;) {
    const at = text.indexOf(key, from);
    if (at < 0) {
      return undefined;
    }
    const end = at + key.length;
    if (/^\s*:/u.test(text.slice(end))) {
      return { start: at, end };
    }
    from = end;
  }
}

function malformed(problem: FUD0725Problem, span?: Span): FileDiagnostic {
  return FUD0725({ file: CONFIG_FILE, ...problem, ...(span === undefined ? {} : { span }) });
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
