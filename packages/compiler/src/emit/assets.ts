/**
 * The asset linker (SDD-19 §4.5). Vite is blind to URLs baked into emitted strings
 * (`$dom.setAttr($n,'src',"./logo.png")`) and inside `export const css = \`… url(…) …\``.
 * Under the plugin's `linkAssets` mode the emit turns each static, relative asset URL
 * into a real ES import — `import __fudic_asset_0 from "./logo.png"` — and references
 * the binding instead of the literal, so Vite owns resolution, hashing, `base` and the
 * immutable cache exactly as it does for the `.fud` graph. Absolute, scheme, data,
 * protocol-relative, root-absolute (public) and fragment URLs are left untouched, as
 * are dynamic (computed) refs — the permissive stance of "we don't touch what we can't
 * see".
 *
 * v1 links single-URL attributes (`src`, `poster`, `<link href>`) and CSS `url(…)`;
 * `srcset` (a multi-URL descriptor list) is a documented follow-up.
 */

/** Escape a literal chunk for embedding in a template literal (backtick/backslash/`$`). */
const escapeTpl = (s: string): string => s.replace(/[`\\$]/gu, '\\$&');

/**
 * Injected URL resolver: the published URL of a linkable specifier.
 *
 * When the host provides one, the emit writes that URL as a literal and registers no import
 * at all — which is the only shape that can be right. An import asks the bundler what a file
 * means, and the answer depends on the extension (a `.css` is a stylesheet with no default
 * export, and the build dies) and on WHICH build asks (an asset's hashed name is a property
 * of the bundle, so three passes over the same `.fud` produce three different URLs for one
 * file). The host knows the one answer; it is asked for it.
 */
export type AssetUrl = (spec: string, origin: AssetOrigin) => string;

/**
 * Where a linked reference was written — a fact about the SOURCE, which is the only thing
 * the compiler is in a position to state.
 *
 * `'head'` is a `<head>` of a document: the layout's, the page's, the route's contribution.
 * What is written there is what every page needs to render ITSELF — its stylesheet, its
 * icon — and that is the definition of a shell, not a media type. `'markup'` is everything
 * else: an `<img>` inside a component, a `url(…)` inside a sheet. That is content, and it
 * belongs to a runtime cache.
 *
 * The compiler does not know what a shell is and must not: it says where the line was
 * written and the host decides what that is worth.
 */
export type AssetOrigin = 'head' | 'markup';

/** Injected existence check: does a linkable specifier resolve to a real file? */
export type AssetExists = (spec: string) => boolean;

/**
 * Injected reader: the TEXT of an asset the author asked to embed (`…?inline`, SDD-45 §3.6).
 *
 * A port and not a filesystem call, for the reason every other one here is: the compiler has
 * no filesystem, and the host is the only side that knows where a specifier lands. `null` is
 * a file it cannot read, and then the reference stays what the author wrote — a URL — which
 * is the same permissive stance the rest of this linker takes.
 */
export type AssetText = (spec: string) => string | null;

/**
 * The URL of the pruned copy of a linked sheet (SDD-49 §3.5). The host names it by its
 * content and publishes it; the compiler has no filesystem.
 */
export type AssetSheet = (spec: string, css: string, origin: AssetOrigin) => string;

export class AssetLinker {
  readonly #enabled: boolean;
  readonly #exists: AssetExists | undefined;
  readonly #url: AssetUrl | undefined;
  readonly #text: AssetText | undefined;
  readonly #sheet: AssetSheet | undefined;
  readonly #imports: string[] = [];
  readonly #bySpec = new Map<string, string>();
  readonly #missing: string[] = [];
  #id = 0;

  constructor(
    enabled: boolean,
    exists?: AssetExists,
    url?: AssetUrl,
    text?: AssetText,
    sheet?: AssetSheet,
  ) {
    this.#enabled = enabled;
    this.#exists = exists;
    this.#url = url;
    this.#text = text;
    this.#sheet = sheet;
  }

  get enabled(): boolean {
    return this.#enabled;
  }

  /**
   * The URL of the pruned copy of the sheet `spec`, whose content is `css` — or `null` when
   * no host publishes copies, and then the `href` stays what the author wrote.
   *
   * Always from a `<head>`: a pruned sheet is one a document links, which is the shell.
   */
  sheetRef(spec: string, css: string): string | null {
    if (!this.#enabled || this.#sheet === undefined) return null;
    return this.#sheet(spec, css, 'head');
  }

  /**
   * The contents of a linkable asset, or `null` when nobody can read it here.
   *
   * Only for a specifier the author asked to embed: what comes back is put IN the document,
   * so a file that cannot be read leaves the reference exactly as it was written.
   */
  textOf(spec: string): string | null {
    if (!this.#enabled || this.#text === undefined) return null;
    if (!AssetLinker.linkable(spec)) return null;
    return this.#text(AssetLinker.filePath(spec));
  }

  /** Linkable specifiers that did not resolve to a file — the plugin reports them as FUD0363. */
  missing(): readonly string[] {
    return this.#missing;
  }

  /**
   * The binding for a linkable, existing asset — or `null` to keep the literal. `null`
   * means: linking off, an already-final URL, or a missing file (recorded for FUD0363,
   * left as a literal so the build does not abort — §4.5/§6.13).
   */
  maybeRef(spec: string, origin: AssetOrigin = 'markup'): string | null {
    if (!this.#enabled || !AssetLinker.linkable(spec)) return null;
    const file = AssetLinker.filePath(spec);
    if (this.#exists && !this.#exists(file)) {
      this.#missing.push(file);
      return null;
    }
    // The host answered: the URL goes in as a literal, and no import is registered.
    if (this.#url !== undefined) {
      return JSON.stringify(this.#url(spec, origin));
    }
    return this.ref(spec);
  }

  /**
   * The file a specifier names: everything before its `?query`.
   *
   * A query is an instruction to the bundler, not part of a filename, and the one place that
   * has to know the difference is the existence check — `theme.css?url` is a real file asked
   * for in a particular way, and answering "not found" to it reports a missing asset that is
   * sitting right there.
   */
  static filePath(spec: string): string {
    const q = spec.indexOf('?');
    return q === -1 ? spec : spec.slice(0, q);
  }


  /**
   * Extensions that are CODE, and therefore never an asset.
   *
   * An asset is a file the browser fetches as it is. These are files somebody compiles: a
   * `.fud` is the component graph, a `.js` is a module. Publishing one as an asset copies
   * the SOURCE into the output and hands the page a URL to it — which is how a misplaced
   * `<link rel="component">` ended up shipping a component's source inside every document.
   * Left as literals, the way every other URL this linker cannot vouch for is left.
   */
  static readonly #CODE = new Set([
    '.fud',
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.mts',
    '.cts',
    '.tsx',
  ]);

  /**
   * A specifier the HOST is asked about. Two shapes reach it, and they are the two ways a
   * project has of naming a file of its own:
   *
   * - **relative** (`./logo.svg`) — the framework owns the URL: hashed, immutable,
   *   published. Code is excluded, because a `.js` is compiled and not fetched as it is.
   * - **root-absolute** (`/logo.svg`) — the author owns the URL, and the file is the
   *   project's public one. Nothing is hashed or published; it is already at its URL. It is
   *   still ASKED about, which is the whole difference: it used to be waved through, so a
   *   typo there was a 404 nobody reported and the Service Worker never heard of the file.
   *   Code is fine here — a public `.js` is served as it is, which is why it is public.
   *
   * Rejected outright: schemes (`http:`, `data:`, …), protocol-relative (`//`) and in-page
   * fragments (`#x`). Those are final URLs, and none of them is ours.
   */
  static linkable(spec: string): boolean {
    if (spec === '') return false;
    if (/^[a-z][a-z0-9+.-]*:/iu.test(spec)) return false; // scheme: http:, data:, blob:, mailto:
    if (spec.startsWith('//')) return false; // protocol-relative
    if (spec.startsWith('#')) return false; // in-page fragment
    if (spec.startsWith('/')) return true; // the project's public file
    const file = AssetLinker.filePath(spec);
    const dot = file.lastIndexOf('.');
    if (dot > Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'))) {
      if (AssetLinker.#CODE.has(file.slice(dot).toLowerCase())) return false;
    }
    return true; // relative path → the framework names it
  }

  /** The JS expression (an import binding) for a specifier, registering its import once. */
  ref(spec: string): string {
    let name = this.#bySpec.get(spec);
    if (name === undefined) {
      name = `__fudic_asset_${this.#id++}`;
      this.#bySpec.set(spec, name);
      this.#imports.push(`import ${name} from ${JSON.stringify(spec)};`);
    }
    return name;
  }

  /** The import lines to emit at the top of the module (empty when nothing was linked). */
  imports(): readonly string[] {
    return this.#imports;
  }

  /**
   * Build the `export const css` template-literal body (including its backticks),
   * rewriting each linkable `url(…)` to `url(${binding})`. When disabled or with no
   * linkable URLs this is byte-identical to the plain escaped template.
   */
  cssTemplate(css: string): string {
    if (!this.#enabled) return '`' + escapeTpl(css) + '`';
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gu;
    let out = '`';
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(css)) !== null) {
      const binding = this.maybeRef(m[2]!);
      if (binding === null) continue; // absolute or missing → keep the literal url(...)
      out += escapeTpl(css.slice(last, m.index)) + 'url(${' + binding + '})';
      last = m.index + m[0].length;
    }
    return out + escapeTpl(css.slice(last)) + '`';
  }
}
